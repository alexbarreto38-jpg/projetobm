# Publicar o Ponto WISE no Cloudflare (grátis)

Esta é a versão para a **Cloudflare** — 100% gratuita, sempre no ar, com os
dados salvos no banco **D1**. Tudo roda num **Worker** que serve a interface e
uma API.

Estrutura desta pasta (`cloudflare/`):
- `src/index.js` — o Worker (a API + o banco).
- `public/index.html` — a interface (empresa, colaborador e gestor).
- `schema.sql` — as tabelas do banco.
- `wrangler.toml` — a configuração.

---

## Passo a passo

Você vai usar o **Wrangler** (a ferramenta da Cloudflare). Precisa ter o
**Node.js** instalado no seu computador.

### 1. Entrar na Cloudflare
```bash
cd cloudflare
npx wrangler login
```
Abre o navegador para você autorizar (crie a conta grátis se ainda não tem).

### 2. Criar o banco de dados D1
```bash
npx wrangler d1 create ponto-wise
```
Ele imprime um `database_id`. **Copie esse id** e cole no `wrangler.toml`, no
lugar de `PREENCHER_APOS_CRIAR`.

### 3. Criar as tabelas (no banco da nuvem)
```bash
npx wrangler d1 execute ponto-wise --remote --file=schema.sql
```

### 4. Definir as senhas (segredos)
```bash
npx wrangler secret put PONTO_SECRET
# cole uma frase longa e aleatória (chave de segurança)

npx wrangler secret put PONTO_ADMIN_SENHA
# cole a senha do gestor que você quiser
```

### 5. Publicar
```bash
npx wrangler deploy
```
No fim ele mostra o endereço, algo como:
`https://ponto-wise.SEU-USUARIO.workers.dev`

### 6. Definir o PIN inicial do gestor
O gestor "Alex" já vem criado com o PIN **1000**. Entre em
`https://.../admin`, use a senha (`PONTO_ADMIN_SENHA`) **ou** o PIN 1000, e
troque o PIN em **"Minha senha de acesso"**.

---

## Os três endereços

| App | Endereço | Para quem |
|-----|----------|-----------|
| **Empresa** (bater ponto) | `https://.../` | tablet/PC da empresa |
| **Colaborador** (celular) | `https://.../meu` | celular de cada um |
| **Gestor** (você) | `https://.../admin` | seu PC |

> Dica: cada colaborador pode salvar o link `/meu` na tela inicial do celular
> ("Adicionar à tela de início") — fica parecido com um app.

---

## Custa alguma coisa?

Não, para uma equipe pequena. Os planos gratuitos da Cloudflare cobrem:
- **Workers**: 100 mil requisições por dia grátis.
- **D1**: 5 GB de banco e milhões de leituras/gravações grátis por mês.
- Sempre no ar (não "dorme") e com HTTPS automático.

## Atualizar depois

Se eu mudar algo no código, é só rodar de novo:
```bash
cd cloudflare
npx wrangler deploy
```
(As tabelas só precisam ser criadas uma vez, no passo 3.)

## Backup dos dados
```bash
npx wrangler d1 export ponto-wise --remote --output=backup.sql
```
Guarde o `backup.sql` de tempos em tempos — é a cópia do seu histórico.

## Câmera (foto do ponto)
Como a Cloudflare já serve com **HTTPS**, a câmera funciona em qualquer
celular. Na primeira batida, o navegador pede permissão de câmera — é só
autorizar. Se negar, a batida é registrada sem foto.

## Notificação push "de verdade" (opcional)
As notificações aparecem dentro do app quando o colaborador abre. Para
estourarem na tela do celular no horário (mesmo com o app fechado), dá para
ligar um serviço de push (Web Push/OneSignal) depois — é um passo extra.
