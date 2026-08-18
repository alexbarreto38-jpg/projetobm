# Colocar o assistente no ar (conectar e usar)

Guia turnkey: você **só preenche variáveis e conecta o WhatsApp** — sem editar
código. O assistente já vem pronto no repositório.

## 1. Suba a stack

```bash
cp .env.example .env      # edite o .env (passo 2)
docker compose up --build
docker compose exec api pnpm --filter @wise/api seed:demo   # dados de demonstração (1x)
```

Acesse **http://localhost:3000** (login demo: `demo@demo.com` / `demo12345678`).
O painel do assistente fica em **/assistant** (menu lateral “Assistente”).

## 2. Preencha o `.env` (é só copiar/colar os valores)

Mínimo para o assistente responder:

```bash
ANTHROPIC_API_KEY=sk-ant-...          # chave da Anthropic (liga o assistente)
```

Para rodar sobre o **Infobip** (saldo, templates, envio reais):

```bash
INFOBIP_BASE_URL=https://XXXXX.api.infobip.com   # base da SUA conta Infobip
INFOBIP_API_KEY=...                               # API key do Infobip
# Seus números de negócio (E.164 sem '+'):
INFOBIP_SENDERS=[{"id":"empresa-x","number":"5511999994587","label":"Empresa X"}]
# Quem pode falar com o assistente pelo WhatsApp (telefone → usuário/org/papel):
INFOBIP_INBOUND_USERS=[{"phone":"+5511977776666","userId":"op1","organizationId":"<ORG_ID>","role":"OPERATOR"}]
INFOBIP_WEBHOOK_TOKEN=um-segredo-forte            # protege os webhooks
# Opcionais:
INFOBIP_PRICE_PER_MESSAGE=0.05                     # habilita estimativa de custo
TRANSCRIBE_URL=https://seu-stt/v1/audio/transcriptions   # aceitar áudio
TRANSCRIBE_API_KEY=...
```

> Deixar `INFOBIP_*` vazio faz o assistente usar a **Meta** como backend.
> Variáveis em branco são ignoradas — não quebram a subida.

Depois de editar o `.env`: `docker compose up -d` (recria com os novos valores).

## 3. Conecte o WhatsApp (no painel do Infobip)

Aponte os webhooks da sua conta WhatsApp/Infobip para a sua API pública:

| Evento | URL | Header |
|---|---|---|
| Mensagens recebidas | `https://SEU-DOMINIO/api/webhooks/infobip/whatsapp/inbound` | `x-infobip-token: <INFOBIP_WEBHOOK_TOKEN>` |
| Relatórios de entrega | `https://SEU-DOMINIO/api/webhooks/infobip/delivery` | `x-infobip-token: <INFOBIP_WEBHOOK_TOKEN>` |

Garanta que os **templates** que você vai usar estão **aprovados** no Infobip
para os `senders` configurados.

## 4. Pronto — use

- **Pelo WhatsApp:** mande uma mensagem do telefone cadastrado em
  `INFOBIP_INBOUND_USERS`. Ex.: *“Quero fazer 2.000 envios usando o número da
  Empresa X, com o template confirmação_pagamento; vou mandar a lista.”* O
  assistente valida tudo, mostra a **prévia** e só dispara após você confirmar.
- **Pelo painel:** abra `/assistant` e converse ali mesmo.

## Ver funcionando sem nada configurado

Para ver o fluxo completo (validação → prévia → aprovação → disparo → relatório)
com um **Infobip simulado**, sem chaves:

```bash
pnpm --filter @wise/api demo:assistant
```

## Dúvidas frequentes

- **“O assistente não está habilitado”** no painel → falta `ANTHROPIC_API_KEY`.
- **Áudio não transcreve** → falta `TRANSCRIBE_URL` (o assistente pede texto).
- **Saldo/custo não aparecem** → no Infobip o saldo é real; o custo só aparece se
  `INFOBIP_PRICE_PER_MESSAGE` estiver definido.
- **Escalar em várias réplicas** → basta ter `REDIS_URL` (já vem no compose): o
  estado é compartilhado automaticamente.

Detalhes técnicos: [`docs/architecture/assistant.md`](architecture/assistant.md).
