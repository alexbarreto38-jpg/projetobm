# projetobm

Ferramenta de linha de comando (Node.js) para operar a **WhatsApp Cloud API / Graph API da Meta** em escala:

1. **Subir templates em massa** — envia o mesmo template de mensagem para várias Business Managers (WABAs) de uma vez, para aprovação.
2. **Disparar mensagens em lotes** — envia mensagens de template a partir das BMs, processando as BMs em **lotes de 250 juntas** (configurável), com controle de concorrência, retry e rate limit.

> Requer Node.js 18+ (usa `fetch` nativo). Sem dependências externas.

## Aviso importante

Use apenas com contas e números que você administra e com **opt-in** dos destinatários. O envio de mensagens fora das regras da Meta (spam, sem consentimento) leva a bloqueio de números e banimento de BMs. Respeite os [limites de qualidade e mensageria](https://developers.facebook.com/docs/whatsapp/messaging-limits) e a política do WhatsApp Business.

## Instalação

```bash
git clone <este-repo>
cd projetobm
# sem dependências para instalar; opcionalmente:
npm install
```

## Configuração das BMs

Crie um `bms.csv` (não versione — já está no `.gitignore`) com uma linha por BM:

```csv
name,token,waba_id,phone_id
BM Loja 1,EAAG_TOKEN_1,111111111111111,222222222222222
BM Loja 2,EAAG_TOKEN_2,333333333333333,444444444444444
```

| coluna     | usado para                          | obrigatório         |
|------------|-------------------------------------|---------------------|
| `name`     | apelido nos logs/relatórios         | não (gera um)       |
| `token`    | access token com permissão no WABA  | sim                 |
| `waba_id`  | criar/checar templates              | para `upload-templates` |
| `phone_id` | enviar mensagens (Phone Number ID)  | para `dispatch`     |

Veja `examples/bms.example.csv`.

## 1) Subir templates em massa

Defina o template em JSON (formato da Graph API) — veja `examples/template.example.json`:

```bash
node src/cli.js upload-templates \
  --bms bms.csv \
  --template template.json \
  --concurrency 10 \
  --out resultado-templates.csv
```

O mesmo template é criado em cada BM. O relatório (`--out`) traz, por BM: `ok`, `templateId`, `status` (ex.: `PENDING`) e `error`.

## 2) Checar status dos templates (antes de disparar)

Antes de disparar, confira em quais BMs o template já está **aprovado** — evita mandar para conta com template `PENDING`/`REJECTED`:

```bash
node src/cli.js check-templates --bms bms.csv --name promo_boas_vindas --out status.csv
```

Sem `--name`, resume a contagem por status em cada BM. Com `--name`, mostra o status daquele template por BM e quantas contas estão prontas.

## 3) Disparar mensagens em lotes de 250

Os templates precisam já estar **aprovados** nas BMs. Monte um `recipients.csv` com a coluna `phone` e, se o template tiver variáveis no corpo, colunas `body1`, `body2`, … na ordem:

```csv
phone,body1
5511999990001,Maria
5511999990002,João
```

```bash
node src/cli.js dispatch \
  --bms bms.csv \
  --template-name promo_boas_vindas \
  --api mmlite \
  --lang pt_BR \
  --recipients recipients.csv \
  --batch-size 250 \
  --limit 500 \
  --bm-concurrency 25 \
  --rcpt-concurrency 10 \
  --delay-batches 2000 \
  --out resultado-disparo.csv
```

> **`--limit`** é uma trava de segurança: teto de mensagens na rodada. Ao atingir, os envios restantes são **pulados** (aparecem como `skipped` no relatório) em vez de enviados. Ótimo para a primeira operação real — comece com `--limit` baixo.

### Qual API usar (`--api`)

| `--api` | Endpoint | Para quê |
|---------|----------|----------|
| `mmlite` | `/{phone}/marketing_messages` | **Marketing** — Marketing Messages Lite API. Recomendado para promoções: melhor entrega e é o caminho que a Meta prioriza para marketing. |
| `cloud` (padrão) | `/{phone}/messages` | **Utility / Authentication** (avisos, OTP, cobranças) — Cloud API, que pega os descontos por volume nessas categorias. |

As duas usam a **mesma WABA, o mesmo número e a mesma biblioteca de templates** — só muda o endpoint de envio. Respostas recebidas (inbound) sempre chegam pela Cloud API.

Como funciona o disparo:

- As BMs são divididas em **lotes de `--batch-size` (padrão 250)**.
- Dentro de cada lote, até `--bm-concurrency` BMs são processadas em paralelo.
- Para cada BM, até `--rcpt-concurrency` mensagens são enviadas em paralelo aos destinatários.
- `--delay-batches` insere uma pausa (ms) entre lotes, útil para suavizar picos de rate limit.

Por padrão, **a mesma lista de destinatários** é usada em todas as BMs. Para listas diferentes por BM, dá para estender `dispatchInBatches` passando um `recipientsByBM` (Map `name -> recipients[]`) — o suporte já existe em `src/dispatch.js`.

## 4) Receber status de entrega (webhook)

Para saber quem **recebeu / leu / falhou**, suba o servidor de webhook e cadastre a URL no painel da Meta (produto WhatsApp → Configuração → Webhooks), assinando o campo `messages`:

```bash
node src/cli.js webhook \
  --verify-token meutoken \
  --app-secret <APP_SECRET> \
  --port 3000 \
  --out status.csv
```

- **Handshake**: a Meta faz um `GET` com `hub.verify_token`; o servidor devolve o `hub.challenge` se o token bater.
- **Eventos**: cada `POST` traz status (`sent`/`delivered`/`read`/`failed`) e é validado pela assinatura `X-Hub-Signature-256` usando o App Secret. Sem App Secret, roda em modo dev **sem validar** (não use assim em produção).
- Cada status vira uma linha em `--out status.csv` (com `messageId`, `recipient`, `status`, `errorCode`), permitindo cruzar com os `messageId` retornados no disparo.

> A URL precisa ser pública e HTTPS para a Meta alcançar. Em produção, ponha atrás de um proxy/reverso com TLS (nginx, Caddy) ou um túnel para testes.

## 5) Reconciliar disparo × entrega

Para fechar a régua (quem recebeu, leu ou falhou), cruze o CSV detalhado do disparo com o CSV do webhook. O disparo gera o detalhado com `--sends-out`:

```bash
node src/cli.js dispatch ... --sends-out sends.csv        # 1 linha por envio, com messageId
node src/cli.js webhook ... --out status.csv              # status recebidos ao vivo
node src/cli.js reconcile --sends sends.csv --status status.csv --out final.csv
```

O `reconcile` junta os dois por `messageId` e resolve o **status final** de cada envio:

| finalStatus | significado |
|-------------|-------------|
| `read` / `delivered` / `sent` | status mais avançado observado no webhook |
| `failed` | a Meta reportou falha na entrega (traz `errorCode`/`errorTitle`) |
| `send_failed` | falhou já no envio (nem chegou à Meta) |
| `skipped` | pulado pela trava `--limit` |
| `no_status` | enviado, mas o webhook ainda não retornou status |

Sem `--out`, imprime só o resumo (ex.: `read=1 failed=1 send_failed=1`).

## 6) Reprocessar só quem falhou

A partir do `final.csv`, reenvie o template apenas para os destinatários que falharam — cada um volta para a **sua** BM automaticamente:

```bash
node src/cli.js retry \
  --bms bms.csv \
  --from final.csv \
  --template-name promo_boas_vindas \
  --recipients recipients.csv \
  --sends-out retry-sends.csv
```

- Por padrão reprocessa `failed` e `send_failed`. Use `--statuses failed,send_failed,no_status` ou `--include-no-status` para incluir os sem retorno (cuidado: pode duplicar quem ainda vai receber status).
- `--recipients` (opcional) recupera as **variáveis originais** do template por telefone; sem ele, reenvia sem variáveis.
- Aceita as mesmas opções do `dispatch` (`--api`, `--limit`, `--batch-size`, concorrência…). Gera um novo `--sends-out` que você pode reconciliar de novo — fechando o loop.

> Fluxo completo: `dispatch → webhook → reconcile → retry → (reconcile de novo)`.

## Opções úteis

- `--dry-run` — valida os arquivos e mostra o que seria feito, **sem chamar a API**.
- `--version vXX.X` — versão da Graph API (padrão `META_API_VERSION` ou `v21.0`).
- `--out arquivo.csv` — salva o relatório de resultados.
- `LOG_LEVEL=debug` — logs mais detalhados.

## Robustez

- **Retry com backoff exponencial** para HTTP 429/5xx e códigos de rate limit da Meta (`4`, `80007`, `131048`, `131056`).
- Erros por BM/destinatário são **isolados**: uma falha não derruba o lote; tudo vai para o relatório.
- Cada BM usa seu próprio token — nada é compartilhado entre contas.

## Estrutura

```
src/
  cli.js         # entrada da linha de comando (upload/check/dispatch/webhook)
  config.js      # carrega BMs, template e destinatários
  metaClient.js  # cliente da Graph API (retry, rate limit)
  templates.js   # upload e checagem de templates em massa
  dispatch.js    # disparo em lotes de 250 (Cloud API / MM Lite, --limit)
  webhook.js     # servidor de webhook de status (assinatura, CSV)
  reconcile.js   # cruza disparo × status de entrega
  retry.js       # plano de reenvio (só quem falhou) por BM
  batch.js       # chunk + concorrência + budget (--limit)
  csv.js         # parser/serializador CSV
  logger.js      # logs
examples/        # exemplos de bms/template/recipients
test/            # testes unitários e de integração (node --test)
```

## Testes

```bash
node --test
```
