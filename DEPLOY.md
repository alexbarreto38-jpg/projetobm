# Colocar o Ponto WISE no ar (Render)

Guia passo a passo para publicar o app na internet, com HTTPS (a foto passa a
funcionar em qualquer celular) e sem depender de um PC ligado.

Vamos usar o **Render** (render.com) — tem plano gratuito para testar.

---

## Passo 1 — Enviar o código para o seu GitHub

O código já está no GitHub, no repositório `alexbarreto38-jpg/projetobm`.
Depois que o Pull Request for aceito (merge), a branch `main` fica com tudo.

## Passo 2 — Criar a conta no Render

1. Acesse **https://render.com** e clique em **Get Started** (dá para entrar
   com a própria conta do GitHub).
2. Autorize o Render a ver o seu GitHub.

## Passo 3 — Criar o serviço a partir do Blueprint

1. No painel do Render, clique em **New +** → **Blueprint**.
2. Escolha o repositório **projetobm**.
3. O Render lê o arquivo `render.yaml` e já monta o serviço `ponto-wise`.
4. Ele vai pedir para preencher duas variáveis (deixadas em branco de
   propósito, por segurança):
   - **PONTO_ADMIN_SENHA** → a senha da sua área do gestor (invente uma forte).
   - **PONTO_GESTOR_PIN** → o PIN inicial do gestor (4 a 6 números), ex.: `4732`.
   - (A `PONTO_SECRET` é gerada sozinha.)
5. Clique em **Apply**. Em poucos minutos ele instala e sobe o app.

## Passo 4 — Pegar os endereços

Quando terminar, o Render mostra o endereço público, algo como:
`https://ponto-wise.onrender.com`

A partir dele, os três acessos são:

| App | Endereço | Para quem |
|-----|----------|-----------|
| **Empresa** (bater ponto) | `https://ponto-wise.onrender.com/` | tablet/PC da empresa |
| **Colaborador** (celular) | `https://ponto-wise.onrender.com/meu` | celular de cada um |
| **Gestor** (você) | `https://ponto-wise.onrender.com/admin` | seu PC |

> Dica: peça para cada colaborador **salvar o link `/meu` na tela inicial do
> celular** (no navegador: "Adicionar à tela de início"). Vira quase um app.

## Passo 5 — Primeiros ajustes no painel do gestor

1. Entre em `/admin` com a **PONTO_ADMIN_SENHA** que você definiu.
2. Cadastre os colaboradores (nome + PIN + horário + minutos de almoço/café).
3. Em **"Minha senha de acesso"**, confirme/ajuste o seu PIN de gestor.

Pronto — está no ar e seguro.

---

## Importante: manter os dados salvos (banco de dados)

No **plano gratuito** do Render, o disco é temporário: a cada atualização do
app **os registros de ponto são apagados**. Isso serve para **testar**, mas
não para uso de verdade.

Para os dados ficarem salvos permanentemente (recomendado para valer):

1. No `render.yaml`, troque `plan: free` por `plan: starter` (~US$7/mês).
2. Descomente o bloco `disk:` no fim do arquivo.
3. Troque a variável `PONTO_DB` para `/var/data/ponto.db`.
4. Faça o commit e o Render recria o serviço já com o disco permanente.

Assim o histórico de ponto nunca se perde, mesmo com atualizações.

### Backup

Com o disco permanente, dá para baixar uma cópia do arquivo `ponto.db` de
tempos em tempos (pelo Shell do Render) e guardar. É o backup do seu histórico.

---

## Alternativa: Railway

O **Railway** (railway.app) também funciona e oferece volume permanente com um
crédito mensal gratuito. O `Procfile` deste projeto já serve para ele:
basta criar o projeto a partir do GitHub, adicionar um volume montado e definir
as mesmas variáveis (`PONTO_ADMIN_SENHA`, `PONTO_GESTOR_PIN`, `PONTO_SECRET`,
`PONTO_DB`).

---

## Notificação push "de verdade" (opcional, mais para frente)

Hoje a notificação aparece **dentro do app** quando o colaborador abre. Para a
mensagem estourar na tela do celular no horário (mesmo com o app fechado),
é preciso ligar um serviço de push (ex.: OneSignal/Firebase) e transformar o
`/meu` em um app instalável (PWA). Dá para fazer depois que estiver no ar.
