'use client';

import { Bot, RotateCcw, Send, User } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Badge, statusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { resetAssistant, sendAssistantMessage } from './actions';

interface Message {
  role: 'user' | 'assistant' | 'error';
  text: string;
}

const SUGGESTIONS = [
  'Quero fazer 2.000 envios usando o número da Empresa X.',
  'Quais remetentes estão disponíveis?',
  'Quais templates eu tenho aprovados?',
  'Como está a campanha de hoje?',
];

const WELCOME =
  'Olá! Posso preparar e disparar campanhas de WhatsApp pra você. Diga o que precisa — por exemplo, quantos envios, qual número e qual template. Vou conferir tudo e mostrar uma prévia antes de qualquer disparo.';

export function AssistantChat({ orgId }: { orgId: string }) {
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: WELCOME }]);
  const [input, setInput] = useState('');
  const [state, setState] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setMessages((m) => [...m, { role: 'user', text: trimmed }]);
    setInput('');
    startTransition(async () => {
      const res = await sendAssistantMessage(orgId, trimmed);
      if (res.error) {
        setMessages((m) => [...m, { role: 'error', text: res.error! }]);
        return;
      }
      setState(res.state);
      setCampaignId(res.campaignId);
      setMessages((m) => [...m, { role: 'assistant', text: res.reply || '(sem resposta)' }]);
    });
  }

  function reset() {
    startTransition(async () => {
      await resetAssistant(orgId);
      setMessages([{ role: 'assistant', text: WELCOME }]);
      setState(null);
      setCampaignId(null);
    });
  }

  return (
    <div className="flex flex-col rounded-xl border border-wise-border bg-wise-surface">
      {/* Barra de estado da operação (fonte de verdade: backend — spec §5, §14). */}
      <div className="flex items-center justify-between gap-2 border-b border-wise-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Bot size={16} className="text-wise-yellow" />
          <span className="font-medium">Assistente de envios</span>
          {campaignId ? <span className="text-wise-muted">· {campaignId}</span> : null}
          {state ? <Badge tone={statusTone(state)}>{state}</Badge> : null}
        </div>
        <Button type="button" variant="ghost" onClick={reset} disabled={pending}>
          <RotateCcw size={14} /> Reiniciar
        </Button>
      </div>

      {/* Histórico */}
      <div ref={scrollRef} className="h-[56vh] space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
        {pending ? (
          <div className="flex items-center gap-2 text-sm text-wise-muted">
            <Bot size={16} className="text-wise-yellow" />
            <span className="animate-pulse">digitando…</span>
          </div>
        ) : null}
      </div>

      {/* Sugestões (só antes da 1ª mensagem do usuário) */}
      {messages.length <= 1 ? (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              disabled={pending}
              className="rounded-full border border-wise-border px-3 py-1.5 text-xs text-wise-muted transition-colors hover:border-wise-yellow hover:text-wise-text disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {/* Entrada */}
      <form
        className="flex items-end gap-2 border-t border-wise-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          rows={1}
          placeholder="Escreva sua mensagem…  (Enter envia, Shift+Enter quebra linha)"
          className="max-h-40 min-h-[40px] flex-1 resize-none rounded-lg border border-wise-border bg-wise-bg px-3 py-2 text-sm text-wise-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wise-yellow"
        />
        <Button type="submit" disabled={pending || !input.trim()}>
          <Send size={16} /> Enviar
        </Button>
      </form>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-full',
          isUser ? 'bg-wise-border text-wise-text' : 'bg-wise-yellow/15 text-wise-yellow',
        )}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div
        className={cn(
          'max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm',
          isUser
            ? 'rounded-tr-sm bg-wise-yellow/10 text-wise-text'
            : isError
              ? 'rounded-tl-sm border border-red-500/30 bg-red-500/5 text-red-400'
              : 'rounded-tl-sm bg-wise-bg text-wise-text',
        )}
      >
        {message.text}
      </div>
    </div>
  );
}
