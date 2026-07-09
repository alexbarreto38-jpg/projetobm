"""Ponto BM — app interno de registro de ponto.

Rodar:  python app.py  (abre em http://localhost:5000)

Variáveis de ambiente opcionais:
  PONTO_DB          caminho do banco SQLite   (padrão: ponto.db)
  PONTO_ADMIN_SENHA senha da área do gestor   (padrão: admin)
  PONTO_TZ          fuso horário              (padrão: America/Sao_Paulo)
"""

import os
import sqlite3
from datetime import datetime, date
from zoneinfo import ZoneInfo

from flask import (
    Flask, g, redirect, render_template, request, session, url_for, flash
)

DB_PATH = os.environ.get("PONTO_DB", os.path.join(os.path.dirname(__file__), "ponto.db"))
ADMIN_SENHA = os.environ.get("PONTO_ADMIN_SENHA", "admin")
TZ = ZoneInfo(os.environ.get("PONTO_TZ", "America/Sao_Paulo"))

app = Flask(__name__)
app.secret_key = os.environ.get("PONTO_SECRET", "troque-esta-chave-em-producao")

TIPOS = ["Entrada", "Saída almoço", "Volta almoço", "Saída"]


# ---------------------------------------------------------------- banco

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS funcionarios (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            nome  TEXT NOT NULL,
            pin   TEXT NOT NULL UNIQUE,
            ativo INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS registros (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id),
            dia            TEXT NOT NULL,   -- YYYY-MM-DD
            horario        TEXT NOT NULL    -- HH:MM:SS
        );
        CREATE INDEX IF NOT EXISTS idx_registros_func_dia
            ON registros (funcionario_id, dia);
        """
    )
    db.commit()
    db.close()


def agora():
    return datetime.now(TZ)


# ---------------------------------------------------------------- cálculo de horas

def total_do_dia(horarios):
    """Soma os intervalos pareando os registros em sequência.

    [08:00, 12:00, 13:00, 17:00] -> 8h. Registro ímpar sobrando é ignorado
    (jornada em aberto).
    """
    total = 0
    for i in range(0, len(horarios) - 1, 2):
        h1 = datetime.strptime(horarios[i], "%H:%M:%S")
        h2 = datetime.strptime(horarios[i + 1], "%H:%M:%S")
        total += int((h2 - h1).total_seconds())
    return total


def fmt_segundos(seg):
    h, resto = divmod(seg, 3600)
    m = resto // 60
    return f"{h:02d}:{m:02d}"


# ---------------------------------------------------------------- ponto (funcionário)

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/bater", methods=["POST"])
def bater():
    pin = request.form.get("pin", "").strip()
    db = get_db()
    func = db.execute(
        "SELECT * FROM funcionarios WHERE pin = ? AND ativo = 1", (pin,)
    ).fetchone()
    if func is None:
        flash("PIN não encontrado. Verifique com o gestor.", "erro")
        return redirect(url_for("index"))

    now = agora()
    dia = now.strftime("%Y-%m-%d")
    horario = now.strftime("%H:%M:%S")
    db.execute(
        "INSERT INTO registros (funcionario_id, dia, horario) VALUES (?, ?, ?)",
        (func["id"], dia, horario),
    )
    db.commit()

    registros = db.execute(
        "SELECT horario FROM registros WHERE funcionario_id = ? AND dia = ? ORDER BY horario",
        (func["id"], dia),
    ).fetchall()
    horarios = [r["horario"] for r in registros]
    batidas = [
        (TIPOS[i] if i < len(TIPOS) else f"Registro {i + 1}", h[:5])
        for i, h in enumerate(horarios)
    ]
    return render_template(
        "confirmacao.html",
        nome=func["nome"],
        agora=now.strftime("%H:%M"),
        data=now.strftime("%d/%m/%Y"),
        batidas=batidas,
        trabalhado=fmt_segundos(total_do_dia(horarios)),
    )


# ---------------------------------------------------------------- área do gestor

def admin_logado():
    return session.get("admin") is True


@app.route("/admin", methods=["GET", "POST"])
def admin():
    if request.method == "POST":
        if request.form.get("senha") == ADMIN_SENHA:
            session["admin"] = True
        else:
            flash("Senha incorreta.", "erro")
        return redirect(url_for("admin"))

    if not admin_logado():
        return render_template("login.html")

    db = get_db()
    funcionarios = db.execute(
        "SELECT * FROM funcionarios ORDER BY ativo DESC, nome"
    ).fetchall()
    return render_template("admin.html", funcionarios=funcionarios)


@app.route("/admin/sair")
def admin_sair():
    session.pop("admin", None)
    return redirect(url_for("index"))


@app.route("/admin/funcionarios", methods=["POST"])
def novo_funcionario():
    if not admin_logado():
        return redirect(url_for("admin"))
    nome = request.form.get("nome", "").strip()
    pin = request.form.get("pin", "").strip()
    if not nome or not pin.isdigit() or not 4 <= len(pin) <= 6:
        flash("Informe um nome e um PIN numérico de 4 a 6 dígitos.", "erro")
        return redirect(url_for("admin"))
    db = get_db()
    try:
        db.execute("INSERT INTO funcionarios (nome, pin) VALUES (?, ?)", (nome, pin))
        db.commit()
        flash(f"{nome} cadastrado(a) com sucesso.", "ok")
    except sqlite3.IntegrityError:
        flash("Este PIN já está em uso — escolha outro.", "erro")
    return redirect(url_for("admin"))


@app.route("/admin/funcionarios/<int:func_id>/alternar", methods=["POST"])
def alternar_funcionario(func_id):
    if not admin_logado():
        return redirect(url_for("admin"))
    db = get_db()
    db.execute("UPDATE funcionarios SET ativo = 1 - ativo WHERE id = ?", (func_id,))
    db.commit()
    return redirect(url_for("admin"))


@app.route("/admin/espelho/<int:func_id>")
def espelho(func_id):
    if not admin_logado():
        return redirect(url_for("admin"))
    db = get_db()
    func = db.execute("SELECT * FROM funcionarios WHERE id = ?", (func_id,)).fetchone()
    if func is None:
        return redirect(url_for("admin"))

    hoje = agora().date()
    mes = request.args.get("mes", hoje.strftime("%Y-%m"))
    registros = db.execute(
        "SELECT dia, horario FROM registros"
        " WHERE funcionario_id = ? AND dia LIKE ? ORDER BY dia, horario",
        (func_id, mes + "%"),
    ).fetchall()

    por_dia = {}
    for r in registros:
        por_dia.setdefault(r["dia"], []).append(r["horario"])

    linhas = []
    total_mes = 0
    for dia, horarios in sorted(por_dia.items()):
        seg = total_do_dia(horarios)
        total_mes += seg
        linhas.append({
            "data": date.fromisoformat(dia).strftime("%d/%m/%Y"),
            "batidas": " · ".join(h[:5] for h in horarios),
            "incompleto": len(horarios) % 2 == 1,
            "total": fmt_segundos(seg),
        })

    return render_template(
        "espelho.html",
        func=func,
        mes=mes,
        linhas=linhas,
        total_mes=fmt_segundos(total_mes),
    )


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
