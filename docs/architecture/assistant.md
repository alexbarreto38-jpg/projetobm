# Módulo 1 — Assistente conversacional (WhatsApp)

Assistente operacional de IA que recebe comandos em linguagem natural (texto e
áudio transcrito) e os transforma em ações reais de envio, com preparação,
prévia obrigatória, confirmação explícita, execução e relatório — sempre por
meio das ferramentas do backend, nunca em execução livre pelo modelo.

> A IA pode **preparar** quase tudo, mas operações **irreversíveis ou
> financeiramente sensíveis** (disparo, recarga) passam pelas regras do backend
> e por **confirmação explícita**. A experiência é simples para o usuário; a
> infraestrutura por trás é rigorosa em segurança, permissões, logs e validação.

## Arquitetura (spec §2, §25)

```
Usuário → WhatsApp → (transcrição de áudio) → texto
      → AssistantService (apps/api)
          → runAssistantTurn  (@wise/assistant — o "cérebro")
              → LLM (Anthropic) ⇄ laço de tool-use
              → dispatchTool → guardrails (permissão, limites, confirmação)
                  → AssistantBackend (PrismaAssistantBackend)
                      → serviços reais (CampaignService, Prisma, Meta)
      → resposta em texto ao usuário
```

A separação é intencional:

- **`@wise/assistant`** é o cérebro conversacional. Não conhece Prisma, Fastify
  nem o provedor de LLM — depende só de interfaces (`AssistantBackend`,
  `LlmClient`). É totalmente testável sem banco nem rede (29 testes unitários).
- **`apps/api/src/modules/assistant`** é a fiação: implementa `AssistantBackend`
  contra os serviços reais, constrói o `LlmClient` (Anthropic) e expõe as rotas.

## Máquina de estados da campanha (spec §14)

```
DRAFT → PREPARED → AWAITING_APPROVAL → APPROVED → EXECUTING → COMPLETED
  (rascunho) (preparado) (aguardando aprovação) (aprovado) (executando) (finalizado)
```

Travas centrais:

- Só se sai de `AWAITING_APPROVAL` para `APPROVED` por **confirmação explícita**
  de um usuário com permissão `campaign:execute`.
- A aprovação fica **atrelada ao hash da configuração** aprovada. Se qualquer
  slot relevante (remetente, template, lista, público, mapeamento, horário)
  mudar depois, a aprovação é descartada e a sessão **volta a `DRAFT`** — impede
  que um "pode enviar" antigo autorize um envio diferente do revisado.
- Em `EXECUTING`/`COMPLETED` a configuração é imutável.

## Guardrails

| Regra | Onde | Spec |
|---|---|---|
| Permissão exigida por ferramenta (não contornável por insistência) | `dispatcher.ts` | §19 |
| Prévia obrigatória antes do disparo | `generate_campaign_preview` | §13 |
| Confirmação explícita separada da execução | `approve_campaign` → `start_campaign` | §14 |
| Segunda aprovação acima do limite de mensagens | `policy.ts` + `approve_campaign` | §20 |
| Bloqueio acima do teto absoluto de mensagens/custo | `policy.ts` | §20 |
| Idempotência por id humano de campanha (`CAMP-AAAA-NNNNNN`) | `ids.ts`, `CampaignService` | §19, §23 |
| Nunca "inventar" resultado — todo resultado tem `outcome` | `result.ts` | §24 |
| Erros técnicos traduzidos, nunca escondidos | `dispatcher.ts` | §22 |

O campo `outcome` (`planned` / `requested` / `processing` / `confirmed` /
`failed`) é o coração do §24: o prompt do sistema instrui o modelo a só dizer
que algo "foi enviado" quando o backend confirmou. `start_campaign` retorna
`processing` (enfileirado), **nunca** "enviado com sucesso".

## Ferramentas (spec §26)

Consulta: `get_account_balance`, `list_senders`, `get_sender`, `list_templates`,
`get_template`, `estimate_campaign_cost`, `get_campaign_status`,
`get_campaign_report`.

Preparação (reversível): `create_campaign_draft`, `select_sender`,
`select_template`, `attach_contact_list`, `map_template_variables`,
`set_schedule`, `generate_campaign_preview`, `request_campaign_approval`,
`request_account_recharge`.

Sensível (irreversível/financeiro): `approve_campaign`, `start_campaign`,
`pause_campaign`, `cancel_campaign`, `execute_authorized_recharge`.

Os schemas Zod das ferramentas viram JSON Schema para o LLM (`jsonschema.ts`) —
uma única fonte de verdade valida em runtime e descreve a ferramenta ao modelo.

## Provider Infobip (spec §1)

O mesmo cérebro roda sobre o **Infobip** sem qualquer mudança: `@wise/infobip-provider`
implementa a mesma interface `AssistantBackend`. Trocar Meta ↔ Infobip é só
fiação.

- **Cliente tipado** (`InfobipClient`, via `fetch`, auth `Authorization: App <key>`):
  saldo (`/account/1/balance`), templates (`/whatsapp/2/senders/{sender}/templates`),
  envio de template em lote (`/whatsapp/1/message/template`).
- **`InfobipAssistantBackend`**: senders configurados, agregação de templates com
  aprovação por sender, **validação da lista** (normalização E.164 + dedupe via
  `@wise/validation`), envio em lotes com `messageId` idempotente (§54) e
  acompanhamento por **relatórios de entrega**.
- **Stores** (`ContactListStore`, `CampaignStore`) — in-memory no MVP, trocáveis
  por Redis/Postgres. `ingestDeliveryReports` alimenta o andamento pelo webhook.

Diferente da Meta, o Infobip **expõe saldo** — então `get_account_balance`
funciona de verdade (§11). Custo por mensagem é opcional (`INFOBIP_PRICE_PER_MESSAGE`);
sem ele, a estimativa fica `supported:false`. Recarga por API não existe no
Infobip → `supported:false` (§12).

Habilitação (API escolhe o provider automaticamente quando as variáveis existem):

```
INFOBIP_BASE_URL=https://xxxxx.api.infobip.com
INFOBIP_API_KEY=...
INFOBIP_SENDERS=[{"id":"empresa-x","number":"5511999994587","label":"Empresa X"}]
INFOBIP_PRICE_PER_MESSAGE=0.05   # opcional
INFOBIP_WEBHOOK_TOKEN=...        # protege o webhook de entrega
```

Rotas extras do provider Infobip:

- `POST /organizations/:id/assistant/lists` — ingere uma lista já parseada
  (`{ ref, columns, rows }`) no `ContactListStore` para o `attach_contact_list`.
- `POST /api/webhooks/infobip/delivery` — recebe os relatórios de entrega do
  Infobip (`{ results: [...] }`) e atualiza o andamento das campanhas (§16, §31).

## Painel web (conversar com o assistente)

O painel (`apps/web`) tem a página **Assistente** (`/assistant`): um chat que fala
com o backend pelo BFF (`POST /api/organizations/:id/assistant/messages`) — o
token de sessão nunca vai ao navegador (spec §8, §46). Mostra o estado da
campanha (rascunho → … → executando) e o id, tem sugestões iniciais e um botão
de reiniciar (`/assistant/reset`). **Usa a mesma sessão do canal WhatsApp** — a
operação continua entre os dois canais (spec §5). A página só é útil quando o
assistente está habilitado (`ANTHROPIC_API_KEY`); sem ele, responde que não está
configurado.

## Processamento assíncrono do webhook de entrada (spec §3, §23, §27)

O webhook de entrada **responde 200 imediatamente** e enfileira o processamento
(transcrição + LLM + resposta) numa `InboundQueue`, drenada em segundo plano por
um laço sequencial. Isso evita timeout e reentrega pelo Infobip. A implementação
padrão é `InProcessInboundQueue` (instância única, com backpressure/descarte
acima do `maxDepth`). Para múltiplas réplicas, troque por uma fila Redis/BullMQ +
stores em Redis — a interface `InboundQueue` permite a substituição sem tocar no
webhook. Dedupe por `messageId` continua no webhook (spec §23).

## O que a infraestrutura Meta **não** expõe (honestidade — spec §11, §24)

Este backend usa as APIs **oficiais da Meta**, que não oferecem alguns recursos
que o produto prevê de forma genérica. Em vez de inventar valores, as
capacidades correspondentes retornam `supported:false`:

- **Saldo pré-pago** (`get_account_balance`) — não exposto pela Graph API.
- **Custo unitário simples** (`estimate_campaign_cost`) — o preço da Meta é por
  conversa e varia por país/categoria. Evolução: tabela de preços por mercado.
- **Recarga por API** (`request/execute_recharge`) — sem API de billing; o
  assistente orienta a recarga pelo painel/financeiro.

Quando essas capacidades existirem (outro provedor ou integração de billing),
basta implementar os métodos do `AssistantBackend` — o cérebro não muda.

## Endpoints

Só registrados quando `ANTHROPIC_API_KEY` está configurado.

- `POST /organizations/:id/assistant/messages` — corpo `{ "text": "..." }`
  (texto do usuário, já transcrito se veio de áudio). Retorna
  `{ reply, campaignId, state }`.
- `POST /organizations/:id/assistant/reset` — limpa a conversa do usuário.

## Persistência da conversa

O estado da conversa (rascunho + histórico) usa um `AssistantSessionStore`. O
MVP traz `InMemorySessionStore` (uma instância). Em produção com múltiplas
réplicas, implemente o store sobre Redis/Postgres para sobreviver a reinícios e
ser compartilhado entre instâncias.

## Canal WhatsApp e áudio (spec §3, §29)

O canal de entrada do WhatsApp via Infobip está implementado:
`POST /api/webhooks/infobip/whatsapp/inbound` recebe as mensagens (MO) e, para
cada uma:

1. **Identifica o usuário** pelo telefone (`INFOBIP_INBOUND_USERS` → usuário/
   organização/papel). Sem correspondência, responde "não autorizado" e nada é
   executado (spec §19).
2. **Texto** → segue direto; **áudio** → baixa a mídia e transcreve
   (`Transcriber`); **arquivo CSV** → faz o parse, registra a lista no
   `ContactListStore` e informa a referência ao assistente para o
   `attach_contact_list` (spec §6); outros tipos → responde o que aceita.
3. Chama o assistente (mesma sessão da rota REST — store compartilhado) e
   **responde de volta pelo WhatsApp** (`sendTextMessage`) a partir do número de
   negócio que recebeu.
4. **Dedupe** por `messageId` (spec §23). Processamento síncrono no MVP; em
   produção, enfileire e responda 200 imediatamente.

Transcrição: `HttpTranscriber` (compatível com `/audio/transcriptions`, ex.:
Whisper self-hosted) quando `TRANSCRIBE_URL` está configurado; caso contrário
`UnavailableTranscriber` falha de forma explícita e o canal pede texto — nunca
"inventa" a transcrição (spec §24).

Configuração do canal:

```
INFOBIP_INBOUND_USERS=[{"phone":"+5511977776666","userId":"u1","organizationId":"org1","role":"OPERATOR"}]
TRANSCRIBE_URL=https://seu-stt/v1/audio/transcriptions   # opcional
TRANSCRIBE_API_KEY=...                                    # opcional
INFOBIP_WEBHOOK_TOKEN=...   # protege inbound e delivery (header x-infobip-token)
```

Aponte o webhook de mensagens recebidas do Infobip para
`/api/webhooks/infobip/whatsapp/inbound` e o de relatórios de entrega para
`/api/webhooks/infobip/delivery`.

## Configuração

```
ANTHROPIC_API_KEY=...          # habilita o assistente
ANTHROPIC_MODEL=claude-sonnet-5 # opcional
ANTHROPIC_BASE_URL=...          # opcional
```
