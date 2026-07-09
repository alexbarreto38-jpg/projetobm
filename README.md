# Ponto BM 🕐

App interno de registro de ponto para a empresa. Feito em Python (Flask) com
banco SQLite — sem dependência de serviços externos, roda em qualquer máquina
da rede interna.

## Funcionalidades

- **Bater ponto por PIN**: cada funcionário tem um PIN de 4 a 6 dígitos e
  registra entrada, saída para o almoço, volta do almoço e saída do dia em um
  terminal compartilhado (computador ou tablet).
- **Confirmação na hora**: após a batida, o funcionário vê as batidas do dia e
  o total de horas trabalhadas até o momento.
- **Área do gestor** (protegida por senha): cadastro, desativação e reativação
  de funcionários.
- **Espelho de ponto mensal**: batidas dia a dia, total diário e total do mês
  por funcionário, com filtro por mês.

## Como rodar

```bash
pip install -r requirements.txt
python app.py
```

O app sobe em `http://localhost:5000`. O banco (`ponto.db`) é criado
automaticamente na primeira execução.

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
2. Cadastre os funcionários com nome e PIN.
3. Deixe a tela inicial aberta em um computador/tablet compartilhado — cada
   pessoa digita o próprio PIN para bater o ponto.
4. No fim do mês, abra o **Espelho de ponto** de cada funcionário para ver as
   horas.

## Como as horas são calculadas

As batidas do dia são pareadas em sequência: 1ª–2ª, 3ª–4ª, e assim por diante.
Exemplo: `08:00 · 12:00 · 13:00 · 17:00` = 8h. Se o dia tem um número ímpar de
batidas (jornada em aberto), a última batida fica de fora da soma até o par
ser fechado.
