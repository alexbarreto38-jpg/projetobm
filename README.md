# Bater Ponto da WISE 🕐

App interno de registro de ponto para a empresa. Feito em Python (Flask) com
banco SQLite — sem dependência de serviços externos, roda em qualquer máquina
da rede interna.

## Três acessos, um só banco de dados

O mesmo servidor atende três "apps", cada um com uma finalidade. Todos leem e
gravam no mesmo banco (o que o colaborador bate na empresa aparece na hora no
app do gestor e no espelho do celular).

| Acesso | Endereço | Para quem | O que faz |
|--------|----------|-----------|-----------|
| **Empresa** | `/`      | dispositivo compartilhado | só bater ponto |
| **Colaborador** | `/meu`   | celular de cada colaborador | só o espelho do mês (horas, descontos, contestação) |
| **Gestor** | `/admin` | você, no PC | painel de administração completo |

## Como funciona

### Colaborador
1. Digita o PIN na tela inicial e cai no **painel de etapas** do dia:
   Entrada · Saída almoço · Volta almoço · Saída café · Volta café · Saída.
2. Toca na etapa disponível, vê o **relógio ao vivo** e a **câmera** (a foto é
   tirada automaticamente no momento da batida) e confirma.
3. Se estiver atrasado, pode marcar a caixinha **"Avisei o gestor e fui
   autorizado(a)"** — o atraso fica registrado como abonado.
4. Ao bater a **Saída**, aparece o **resumão do dia**: batidas, fotos, horas
   trabalhadas e atrasos (descontados ou abonados).
5. Em **Meu espelho**, consulta o mês inteiro: horas trabalhadas, dias com
   registro, tempo descontado e tempo abonado.

### Gestor (senha própria)
- **Equipe hoje**: situação de cada colaborador ao vivo (trabalhando, em
  almoço, no café, encerrado), batidas, horas e tempo perdido do dia.
- **Atrasos do dia**: cada atraso com os minutos excedidos e a situação —
  com botão para **abonar** ou **remover o abono**.
- **Colaboradores**: cadastro com PIN, horário de entrada e minutos permitidos
  de almoço e café (configuráveis por pessoa); ativar/desativar.
- **Espelho de ponto mensal** por colaborador: fotos das batidas, atrasos com
  abono, horas trabalhadas, tempo descontado e abonado.

### Penalidades (atrasos)
- **Entrada**: bater depois do horário previsto (ex.: previsto 08:00, bateu
  08:24) gera aviso na hora com os minutos excedidos (24 min).
- **Almoço e café**: pausa acima do permitido gera o excedente.
- Atraso **abonado** (colaborador avisou e o gestor autorizou, ou o gestor
  abonou no painel) não entra no tempo descontado.
- O mês fecha com o total: horas trabalhadas, tempo descontado e abonado.

## Como rodar

```bash
pip install -r requirements.txt
python app.py
```

O app sobe em `http://localhost:5000`. O banco (`ponto.db`) é criado
automaticamente na primeira execução.

> **Câmera:** os navegadores só liberam a câmera em `http://localhost` ou em
> endereços com **HTTPS**. Se for acessar pelo IP da rede (ex.:
> `http://192.168.0.10:5000`), a batida funciona normalmente, porém sem foto.
> Para ter foto na rede interna, use um túnel/proxy com HTTPS.

### Configuração (opcional, via variáveis de ambiente)

| Variável            | Padrão              | Descrição                        |
|---------------------|---------------------|----------------------------------|
| `PONTO_ADMIN_SENHA` | `admin`             | Senha da área do gestor          |
| `PONTO_DB`          | `ponto.db`          | Caminho do banco SQLite          |
| `PONTO_TZ`          | `America/Sao_Paulo` | Fuso horário das batidas         |
| `PONTO_SECRET`      | (trocar!)           | Chave de sessão do Flask         |
| `PORT`              | `5000`              | Porta do servidor                |

> **Importante:** em uso real, defina `PONTO_ADMIN_SENHA` e `PONTO_SECRET`
> com valores próprios.

## Primeiros passos

1. Acesse **Área do gestor** e entre com a senha (`admin` por padrão).
2. Cadastre os colaboradores com nome, PIN, horário de entrada e minutos de
   almoço/café.
3. Cada colaborador entra com o próprio PIN e bate as etapas do dia.
4. Acompanhe tudo no painel do gestor e feche o mês pelo espelho de ponto.
