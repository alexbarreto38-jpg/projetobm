# Permissões

> ⚠️ **Não assuma que esta lista permanecerá igual** (spec §6). Confirmar na doc
> oficial antes de submeter ao App Review.

## Permissões usadas no Embedded Signup / WhatsApp Business Platform

Verificadas como parte do fluxo oficial atual:

- `business_management` — gerir ativos do Business Manager.
- `whatsapp_business_management` — gerir WABAs, números, templates.
- `whatsapp_business_messaging` — enviar mensagens pela WhatsApp Business Platform.

O Embedded Signup também usa **Facebook Login for Business** com uma configuração
(`config_id`) que declara as permissões solicitadas.

## App Review

- As permissões de mensageria exigem App Review e um caso de uso aprovado.
- Documentar cada permissão pedida e por quê.
- Solicitar o **mínimo necessário** (minimização — spec §44).

## Regras

- App Secret nunca vai ao browser (spec §46).
- Toda operação sensível é backend (spec §8).

---

Last verified against Meta documentation: 2026-08-08 (resultados de busca;
páginas oficiais bloqueadas pelo proxy — reconferir na implementação).
Graph API version: configurável via `META_GRAPH_VERSION`.
Sources:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/
- https://developers.facebook.com/docs/permissions
