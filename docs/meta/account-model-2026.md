# Modelo de contas WhatsApp Business — Legacy vs. Evolução 2026

## Modelo LEGADO (GA hoje)

```
Meta Business Account (portfólio)
└── WhatsApp Business Account (WABA)
    ├── Phone Numbers
    └── Message Templates
```

- A **WABA** reúne números, templates, mensageria e associação de cobrança.
- É o modelo **primário e disponível em GA**. O `LegacyWabaAdapter` o implementa.

## Evolução 2026 (em transição / rollout)

A Meta anunciou uma evolução ao longo de 2026 que **separa identidade/número de
mensageria/templates/cobrança**. Sinais públicos verificados:

- **WhatsApp usernames** em rollout ao longo de 2026 (afeta primeiro conversas
  novas de usuários que adotaram username).
- **Business-Scoped User IDs (BSUID):** identificador único por par
  usuário↔portfólio de negócio, substituindo o número de telefone do cliente
  como chave de conversa em muitos fluxos. Apenas números do mesmo portfólio
  podem mensagear um dado BSUID.
- **Contact Book:** mapeia números de clientes para BSUIDs a partir de eventos
  de conversa.
- Direção geral: **Phone/Identity Account** (números) separada de **Messaging
  Account** (templates, mensageria, associação de cobrança).

```
Meta Business Account
├── Phone / Identity Account
│   └── Phone Numbers
└── Messaging Account
    ├── Templates
    ├── Messaging
    └── Billing association
```

> ⚠️ **Os nomes exatos de objetos, IDs, edges e webhooks do novo modelo NÃO
> estão consolidados em uma API GA estável.** Não os inventamos. O
> `NewAccountModelAdapter` deixa cada método como ponto de extensão explícito,
> lançando erro claro até que o endpoint seja confirmado na doc oficial,
> implementado e testado (spec §4, §57, §66).

## Como a aplicação lida com a transição

1. **`accountModel`** em `whatsapp_accounts`: `LEGACY | NEW_MODEL | UNKNOWN`.
   `legacy_waba_id` **não é obrigatório** → permite migração (spec §12).
2. **Tabelas prontas:** `phone_accounts` e `messaging_accounts` já existem
   (spec §13, §14), populadas apenas quando o modelo novo se aplicar.
3. **Capability detection** (`AccountCapabilities`) tem **precedência** sobre
   feature flags (spec §58). A UI se adapta ao que a conta realmente oferece:
   `legacyTemplates`, `messagingAccountTemplates`, `coexistence`,
   `phoneIdentitySeparation`.
4. **Feature flags** `META_NEW_ACCOUNT_MODEL` / `META_NEW_MESSAGING_ACCOUNT`
   permitem ativação seletiva quando as APIs ficarem disponíveis (spec §57).
5. **Adapter Pattern** (`resolveAdapter`) isola o resto do sistema do modelo
   subjacente (spec §59).

## O que já dá para implementar vs. o que aguarda GA

| Área | Legacy (implementável já) | Novo modelo 2026 |
|------|---------------------------|-------------------|
| Descoberta de números | ✅ `/{waba-id}/phone_numbers` | ⏳ aguardar edges oficiais |
| Templates | ✅ `/{waba-id}/message_templates` | ⏳ Messaging Account templates |
| Envio | ✅ `/{phone-number-id}/messages` | ⏳ confirmar destino BSUID/username |
| Webhooks | ✅ campos atuais | ⏳ novos campos/objetos |
| Cobrança | associada à WABA | ⏳ associação separada |

---

Last verified against Meta documentation: 2026-08-08 (via resultados de busca;
páginas `developers.facebook.com` bloqueadas pelo proxy deste ambiente — reabrir
e reconferir na implementação).
Graph API version: configurável via `META_GRAPH_VERSION` (default de exemplo `v23.0` — confirmar GA atual).
Sources:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/whatsapp-business-accounts
- https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers
- https://developers.facebook.com/docs/graph-api/changelog
