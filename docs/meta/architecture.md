# Arquitetura Meta — objetos e relações

## Objetos (modelo legado, GA)

| Objeto Meta | Representação interna | ID oficial guardado |
|-------------|-----------------------|---------------------|
| Meta Business Account (portfólio) | `meta_businesses` | `externalBusinessId` |
| WhatsApp Business Account (WABA) | `whatsapp_accounts` | `externalAccountId` (+ `legacyWabaId`) |
| Business Phone Number | `phone_numbers` | `externalPhoneNumberId` |
| Message Template | `templates` + `template_deployments` | `externalTemplateId` |
| Mensagem enviada | `messages` | `externalMessageId` (wamid) |

**Regra:** nunca usar o número textual como identificador interno; usar o ID
oficial da Meta (spec §15). Meta é source of truth — sincronizamos (spec §50).

## Relações

```
Organization
└── MetaConnection (1 Business Meta)
    └── WhatsAppAccount (WABA no legado)
        ├── PhoneNumber*        (legado: direto na conta)
        ├── PhoneAccount*       (novo modelo — identidade/número)
        │   └── PhoneNumber*
        └── MessagingAccount*   (novo modelo — templates/mensageria)
            └── TemplateDeployment*
```

## Camada de acesso

Todas as chamadas passam por `MetaProvider` → `MetaGraphClient` (versão
centralizada) → adapter (`LegacyWabaAdapter` | `NewAccountModelAdapter`). Ver
`docs/architecture/overview.md` e `docs/meta/account-model-2026.md`.

---

Last verified against Meta documentation: 2026-08-08 (resultados de busca;
páginas oficiais bloqueadas pelo proxy — reconferir na implementação).
Graph API version: configurável via `META_GRAPH_VERSION`.
Sources:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/whatsapp-business-accounts
- https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers
