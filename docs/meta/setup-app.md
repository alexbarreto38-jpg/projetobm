# Guia: criar o app na Meta e coletar as credenciais

Este guia descreve, em passos, como obter as credenciais que o Wise API Manager
usa para falar com o WhatsApp **oficialmente**. Tudo acontece no
**Meta for Developers** (https://developers.facebook.com).

> ⚠️ Os nomes de menus/telas da Meta mudam com frequência. Confirme cada passo
> na documentação oficial atual (spec §66). Este ambiente não acessa
> `developers.facebook.com`, então trate os caminhos abaixo como referência.

## Pré-requisitos
1. **Conta no Meta for Developers** (gratuita).
2. **Meta Business Account** (Business Manager) da sua empresa.
3. **Verificação do negócio** na Meta (envio de documentos) — passo burocrático,
   pode levar dias.
4. Um **número de telefone** dedicado ao WhatsApp Business (não pode estar ativo
   num app WhatsApp comum).

## Passo a passo

### 1. Criar o App
- Meta for Developers → **My Apps** → **Create App** → tipo **Business**.
- Após criar, em **App settings → Basic**:
  - copie o **App ID** → `META_APP_ID`
  - copie o **App Secret** → `META_APP_SECRET` (mantenha em segredo — só backend)

### 2. Adicionar o produto WhatsApp
- No painel do app → **Add products** → **WhatsApp** → Set up.
- Isso cria uma **WhatsApp Business Account (WABA)** de teste e um número de teste.

### 3. Configurar o Embedded Signup (Facebook Login for Business)
- Adicione **Facebook Login for Business** (ou configure via o fluxo do WhatsApp
  Embedded Signup).
- Crie uma **configuration** definindo as permissões solicitadas.
- Copie o **Configuration ID** → `META_CONFIG_ID`.

### 4. Definir o token de verificação do webhook
- Em **WhatsApp → Configuration → Webhooks**, você vai informar:
  - **Callback URL**: `https://SEU_DOMINIO/api/webhooks/meta/whatsapp`
  - **Verify token**: um texto que **você inventa** → `META_WEBHOOK_VERIFY_TOKEN`
- Assine os campos de webhook (mensagens, statuses, template status update).

### 5. Permissões e App Review
- Solicite as permissões (confirme a lista atual na doc):
  - `business_management`
  - `whatsapp_business_management`
  - `whatsapp_business_messaging`
- Envie para **App Review** com o caso de uso. Aprovação é necessária para uso
  em produção com clientes reais.

## Resumo das variáveis

| Variável | Origem |
|----------|--------|
| `META_APP_ID` | App settings → Basic |
| `META_APP_SECRET` | App settings → Basic (secreto) |
| `META_CONFIG_ID` | Configuração do Facebook Login for Business / Embedded Signup |
| `META_WEBHOOK_VERIFY_TOKEN` | você inventa |
| `META_GRAPH_VERSION` | versão GA atual da Graph API (ex.: confirmar no changelog) |
| `META_REDIRECT_URI` | URL de callback do seu Embedded Signup |

Os **tokens de acesso por cliente** NÃO são preenchidos aqui — são obtidos
automaticamente pelo Embedded Signup e guardados cifrados no `CredentialVault`.

## Ligando no Wise API Manager
Preencha essas variáveis no `.env` (ou nos secrets do deploy) e remova o
`META_GRAPH_BASE_URL` do mock (deixe o padrão `https://graph.facebook.com`). O
botão **Conectar WhatsApp** passa a abrir o Embedded Signup real.

---

Last verified against Meta documentation: 2026-08-08 (caminhos de menu são
referência; confirmar na doc oficial atual).
Sources:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/
- https://developers.facebook.com/docs/development/create-an-app
- https://developers.facebook.com/docs/graph-api/changelog
