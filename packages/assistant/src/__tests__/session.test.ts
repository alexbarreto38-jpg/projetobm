import { describe, expect, it } from 'vitest';
import { evaluatePolicy, DEFAULT_SAFETY_POLICY } from '../policy.js';
import {
  approvalIsValid,
  computeConfigHash,
  DraftStateError,
  missingSlots,
  newDraft,
  patchSlots,
  transition,
} from '../session.js';
import { canTransition, isTerminal } from '../states.js';
import { formatCampaignId, isCampaignId } from '../ids.js';
import { completeSlots } from './fakes.js';

function draft() {
  return newDraft({ id: 'CAMP-2026-000001', organizationId: 'org_1', requestedByUserId: 'user_1' });
}

describe('máquina de estados (spec §14)', () => {
  it('permite o caminho feliz e rejeita transições inválidas', () => {
    expect(canTransition('DRAFT', 'PREPARED')).toBe(true);
    expect(canTransition('AWAITING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false); // não pode pular a aprovação
    expect(canTransition('DRAFT', 'EXECUTING')).toBe(false);
    expect(isTerminal('COMPLETED')).toBe(true);
    expect(isTerminal('DRAFT')).toBe(false);
  });

  it('transition() rejeita saltos ilegais', () => {
    const d = draft();
    expect(() => transition(d, 'EXECUTING')).toThrow(DraftStateError);
  });
});

describe('config hash e aprovação (spec §24)', () => {
  it('é estável e independente da ordem das chaves', () => {
    const a = completeSlots();
    const b = { ...completeSlots(), variableMapping: { '2': 'data_atendimento', '1': 'nome' } };
    expect(computeConfigHash(a)).toBe(computeConfigHash(b));
  });

  it('muda quando um slot relevante muda', () => {
    const a = completeSlots();
    const b = { ...a, senderId: 'snd_2' };
    expect(computeConfigHash(a)).not.toBe(computeConfigHash(b));
  });

  it('editar um slot relevante após a aprovação invalida a aprovação e reabre o rascunho', () => {
    let d = newDraft({
      id: 'CAMP-2026-000002',
      organizationId: 'org_1',
      requestedByUserId: 'user_1',
      slots: completeSlots(),
    });
    d = transition(d, 'PREPARED');
    d = transition(d, 'AWAITING_APPROVAL');
    d = {
      ...transition(d, 'APPROVED'),
      approval: {
        configHash: computeConfigHash(d.slots),
        approvedByUserId: 'user_1',
        approvedAt: new Date().toISOString(),
        utterance: 'pode enviar',
      },
    };
    expect(approvalIsValid(d)).toBe(true);

    // Usuário troca o remetente depois de aprovar.
    const edited = patchSlots(d, { senderId: 'snd_9', senderLabel: 'Outro' });
    expect(edited.state).toBe('DRAFT');
    expect(edited.approval).toBeUndefined();
    expect(approvalIsValid(edited)).toBe(false);
  });

  it('bloqueia alteração de slots quando já está EXECUTING', () => {
    let d = newDraft({
      id: 'CAMP-2026-000003',
      organizationId: 'org_1',
      requestedByUserId: 'user_1',
      slots: completeSlots(),
    });
    d = transition(d, 'PREPARED');
    d = transition(d, 'AWAITING_APPROVAL');
    d = transition(d, 'APPROVED');
    d = transition(d, 'EXECUTING');
    expect(() => patchSlots(d, { senderId: 'snd_2' })).toThrow(DraftStateError);
  });
});

describe('slots obrigatórios (spec §4, §13)', () => {
  it('lista o que falta para a prévia', () => {
    expect(missingSlots({})).toContain('senderId');
    expect(missingSlots({})).toContain('templateId');
    expect(missingSlots(completeSlots())).toEqual([]);
  });
});

describe('política de limites (spec §20)', () => {
  it('permite abaixo do limite', () => {
    expect(evaluatePolicy({ estimatedCount: 2000, estimatedCost: 100 }, DEFAULT_SAFETY_POLICY).verdict).toBe(
      'ALLOW',
    );
  });
  it('exige segunda aprovação acima do limite de mensagens', () => {
    const d = evaluatePolicy({ estimatedCount: 200000, estimatedCost: 10 }, {
      ...DEFAULT_SAFETY_POLICY,
      hardMaxMessagesPerOperation: 1_000_000,
    });
    expect(d.verdict).toBe('SECOND_APPROVAL_REQUIRED');
  });
  it('bloqueia acima do teto absoluto de mensagens ou custo', () => {
    expect(evaluatePolicy({ estimatedCount: 300000 }, DEFAULT_SAFETY_POLICY).verdict).toBe('BLOCKED');
    expect(evaluatePolicy({ estimatedCount: 10, estimatedCost: 5000 }, DEFAULT_SAFETY_POLICY).verdict).toBe(
      'BLOCKED',
    );
  });
});

describe('id humano de campanha (spec §23)', () => {
  it('formata e valida', () => {
    expect(formatCampaignId(2026, 123)).toBe('CAMP-2026-000123');
    expect(isCampaignId('CAMP-2026-000123')).toBe(true);
    expect(isCampaignId('camp-123')).toBe(false);
  });
});
