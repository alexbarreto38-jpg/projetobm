# Documentação Meta — regra crítica (spec §66)

Sempre que uma integração Meta for implementada:

1. consultar a documentação **oficial atual** da Meta;
2. registrar a **URL** da documentação;
3. registrar a **versão da Graph API** usada;
4. implementar;
5. criar **teste**;
6. documentar o comportamento.

Nunca usar apenas artigos, fóruns ou respostas antigas como fonte definitiva.

Cada arquivo desta pasta termina com:

```
Last verified against Meta documentation: <DATA>
Graph API version: <vXX.X>
Sources: <URLs oficiais>
```

> ⚠️ **Nota de ambiente:** neste ambiente de desenvolvimento remoto o domínio
> `developers.facebook.com` está **bloqueado pelo proxy de egress**, então as
> páginas não puderam ser buscadas diretamente na elaboração inicial. As URLs
> canônicas estão registradas e **precisam ser reabertas e reconferidas** no
> momento da implementação real de cada endpoint, antes de ir para produção.

## Índice

**Fundamentos**
- `architecture.md` — objetos e relações do WhatsApp Business Platform
- `account-model-2026.md` — evolução do modelo de contas (Legacy vs. New)
- `permissions.md` — permissões necessárias

**Setup e onboarding**
- `setup-app.md` — criar o Meta App e coletar as credenciais (uma vez)
- `onboarding-multi-bm.md` — o que se configura uma vez vs. por BM/cliente
- `embedded-signup.md` — fluxo oficial de onboarding de contas

**Operação**
- `webhooks.md` — verificação e processamento de webhooks
- `templates.md` — criação, replicação e estados de templates
- `messages.md` — envio e eventos de status
- `error-handling.md` — preservação de erros oficiais
