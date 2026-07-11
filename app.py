"""Ponto BM — app interno de registro de ponto.

Rodar:  python app.py  (abre em http://localhost:5000)

Variáveis de ambiente opcionais:
  PONTO_DB          caminho do banco SQLite   (padrão: ponto.db)
  PONTO_ADMIN_SENHA senha da área do gestor   (padrão: admin)
  PONTO_TZ          fuso horário              (padrão: America/Sao_Paulo)
"""

import os
import sqlite3
import calendar as _calendar
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

ROTULOS = {
    "entrada": "Entrada",
    "saida_almoco": "Saída almoço",
    "volta_almoco": "Volta almoço",
    "saida_cafe": "Saída café",
    "volta_cafe": "Volta café",
    "saida": "Saída",
}
ORDEM = list(ROTULOS)

# transições permitidas — almoço e café podem ser pulados, a ordem não
PROXIMOS = {
    None: ["entrada"],
    "entrada": ["saida_almoco", "saida"],
    "saida_almoco": ["volta_almoco"],
    "volta_almoco": ["saida_cafe", "saida"],
    "saida_cafe": ["volta_cafe"],
    "volta_cafe": ["saida"],
    "saida": [],
}

# tipos em que pode haver atraso (e onde faz sentido o aviso ao gestor)
TIPOS_COM_ATRASO = {"entrada", "volta_almoco", "volta_cafe"}

STATUS = {
    None: ("sem-registro", "Sem registro"),
    "entrada": ("trabalhando", "Trabalhando"),
    "volta_almoco": ("trabalhando", "Trabalhando"),
    "volta_cafe": ("trabalhando", "Trabalhando"),
    "saida_almoco": ("pausa", "Em almoço"),
    "saida_cafe": ("pausa", "No café"),
    "saida": ("fora", "Encerrado"),
}


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
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            nome         TEXT NOT NULL,
            pin          TEXT NOT NULL UNIQUE,
            ativo        INTEGER NOT NULL DEFAULT 1,
            papel        TEXT NOT NULL DEFAULT 'colaborador',  -- 'gestor' ou 'colaborador'
            hora_entrada TEXT NOT NULL DEFAULT '08:00',
            almoco_min   INTEGER NOT NULL DEFAULT 60,
            cafe_min     INTEGER NOT NULL DEFAULT 15
        );
        CREATE TABLE IF NOT EXISTS registros (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id),
            dia            TEXT NOT NULL,               -- YYYY-MM-DD
            horario        TEXT NOT NULL,               -- HH:MM:SS
            tipo           TEXT NOT NULL,               -- entrada, saida_almoco, ...
            foto           TEXT,                        -- data URL (jpeg) ou NULL
            abonado        INTEGER NOT NULL DEFAULT 0,  -- 1 = atraso avisado/autorizado
            motivo         TEXT,                        -- justificativa do aviso
            contestacao        TEXT,                    -- justificativa enviada depois
            contestacao_status TEXT                     -- 'pendente' / 'aprovada' / 'recusada'
        );
        CREATE INDEX IF NOT EXISTS idx_registros_func_dia
            ON registros (funcionario_id, dia);
        CREATE TABLE IF NOT EXISTS justificativas (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id),
            dia            TEXT NOT NULL,               -- YYYY-MM-DD
            texto          TEXT NOT NULL,
            status         TEXT NOT NULL DEFAULT 'pendente'  -- pendente/aprovada/recusada
        );
        CREATE INDEX IF NOT EXISTS idx_just_func_dia
            ON justificativas (funcionario_id, dia);
        """
    )
    # migração de bancos criados em versões anteriores
    cols_f = {r[1] for r in db.execute("PRAGMA table_info(funcionarios)")}
    for col, ddl in (
        ("papel", "ALTER TABLE funcionarios ADD COLUMN papel TEXT NOT NULL DEFAULT 'colaborador'"),
        ("hora_entrada", "ALTER TABLE funcionarios ADD COLUMN hora_entrada TEXT NOT NULL DEFAULT '08:00'"),
        ("almoco_min", "ALTER TABLE funcionarios ADD COLUMN almoco_min INTEGER NOT NULL DEFAULT 60"),
        ("cafe_min", "ALTER TABLE funcionarios ADD COLUMN cafe_min INTEGER NOT NULL DEFAULT 15"),
    ):
        if col not in cols_f:
            db.execute(ddl)
    cols_r = {r[1] for r in db.execute("PRAGMA table_info(registros)")}
    for col, ddl in (
        ("tipo", "ALTER TABLE registros ADD COLUMN tipo TEXT NOT NULL DEFAULT 'entrada'"),
        ("foto", "ALTER TABLE registros ADD COLUMN foto TEXT"),
        ("abonado", "ALTER TABLE registros ADD COLUMN abonado INTEGER NOT NULL DEFAULT 0"),
        ("motivo", "ALTER TABLE registros ADD COLUMN motivo TEXT"),
        ("contestacao", "ALTER TABLE registros ADD COLUMN contestacao TEXT"),
        ("contestacao_status", "ALTER TABLE registros ADD COLUMN contestacao_status TEXT"),
    ):
        if col not in cols_r:
            db.execute(ddl)

    # garante que exista um gestor (o painel de administração)
    tem_gestor = db.execute(
        "SELECT COUNT(*) FROM funcionarios WHERE papel = 'gestor'"
    ).fetchone()[0]
    if not tem_gestor:
        usados = {r[0] for r in db.execute("SELECT pin FROM funcionarios")}
        pin = os.environ.get("PONTO_GESTOR_PIN", "1000")
        if pin in usados or not (pin.isdigit() and 4 <= len(pin) <= 6):
            pin = next(str(i) for i in range(1000, 10000) if str(i) not in usados)
        db.execute(
            "INSERT INTO funcionarios (nome, pin, papel, ativo) VALUES (?, ?, 'gestor', 1)",
            (os.environ.get("PONTO_GESTOR_NOME", "Alex"), pin),
        )

    db.commit()
    db.close()


def agora():
    return datetime.now(TZ)


# ---------------------------------------------------------------- cálculos

def _min(h):
    """'HH:MM[:SS]' -> minutos desde a meia-noite."""
    p = h.split(":")
    return int(p[0]) * 60 + int(p[1])


def _seg(h):
    p = h.split(":")
    return int(p[0]) * 3600 + int(p[1]) * 60 + (int(p[2]) if len(p) > 2 else 0)


def fmt_segundos(seg):
    h, resto = divmod(max(seg, 0), 3600)
    return f"{h:02d}:{resto // 60:02d}"


def fmt_minutos(m):
    if m >= 60:
        return f"{m // 60}h{m % 60:02d}"
    return f"{m} min"


def carrega_dia(db, func_id, dia):
    return db.execute(
        "SELECT * FROM registros WHERE funcionario_id = ? AND dia = ? ORDER BY horario, id",
        (func_id, dia),
    ).fetchall()


def trabalhado_do_dia(regs):
    """Segundos trabalhados somando os períodos entre entrada e pausa/saída.

    Retorna (segundos, horário do período em aberto ou None).
    """
    total, ini = 0, None
    for r in regs:
        if r["tipo"] in ("entrada", "volta_almoco", "volta_cafe"):
            ini = r["horario"]
        elif ini is not None:
            total += _seg(r["horario"]) - _seg(ini)
            ini = None
    return total, ini


def atrasos_do_dia(regs, func):
    """Atrasos do dia: entrada após o horário e pausas acima do permitido."""
    por = {r["tipo"]: r for r in regs}
    atrasos = []
    if "entrada" in por:
        m = _min(por["entrada"]["horario"]) - _min(func["hora_entrada"])
        if m > 0:
            atrasos.append({
                "reg_id": por["entrada"]["id"], "evento": "Entrada",
                "detalhe": f"previsto {func['hora_entrada']}, bateu {por['entrada']['horario'][:5]}",
                "minutos": m, "abonado": por["entrada"]["abonado"],
                "motivo": por["entrada"]["motivo"],
                "contestacao": por["entrada"]["contestacao"],
                "contestacao_status": por["entrada"]["contestacao_status"],
            })
    for saida_t, volta_t, limite, nome in (
        ("saida_almoco", "volta_almoco", func["almoco_min"], "Almoço"),
        ("saida_cafe", "volta_cafe", func["cafe_min"], "Café da tarde"),
    ):
        if saida_t in por and volta_t in por:
            dur = _min(por[volta_t]["horario"]) - _min(por[saida_t]["horario"])
            m = dur - limite
            if m > 0:
                atrasos.append({
                    "reg_id": por[volta_t]["id"], "evento": nome,
                    "detalhe": f"pausa de {fmt_minutos(dur)} (permitido {fmt_minutos(limite)})",
                    "minutos": m, "abonado": por[volta_t]["abonado"],
                    "motivo": por[volta_t]["motivo"],
                    "contestacao": por[volta_t]["contestacao"],
                    "contestacao_status": por[volta_t]["contestacao_status"],
                })
    return atrasos


def resumo_do_dia(db, func, dia):
    regs = carrega_dia(db, func["id"], dia)
    seg, aberto = trabalhado_do_dia(regs)
    atrasos = atrasos_do_dia(regs, func)
    perdido = sum(a["minutos"] for a in atrasos if not a["abonado"])
    abonado = sum(a["minutos"] for a in atrasos if a["abonado"])
    return {
        "regs": regs,
        "batidas": [
            {"rotulo": ROTULOS.get(r["tipo"], r["tipo"]), "hora": r["horario"][:5],
             "foto": r["foto"]}
            for r in regs
        ],
        "trabalhado": fmt_segundos(seg),
        "seg": seg,
        "aberto": aberto is not None,
        "atrasos": atrasos,
        "perdido_min": perdido,
        "abonado_min": abonado,
    }


def monta_espelho(db, func, mes):
    """Espelho mensal: linhas por dia + totais do mês."""
    dias = [r["dia"] for r in db.execute(
        "SELECT DISTINCT dia FROM registros WHERE funcionario_id = ? AND dia LIKE ? ORDER BY dia",
        (func["id"], mes + "%"),
    )]
    linhas, tot_seg, tot_perdido, tot_abonado = [], 0, 0, 0
    for dia in dias:
        r = resumo_do_dia(db, func, dia)
        tot_seg += r["seg"]
        tot_perdido += r["perdido_min"]
        tot_abonado += r["abonado_min"]
        linhas.append({
            "data": date.fromisoformat(dia).strftime("%d/%m/%Y"),
            **r,
        })
    return linhas, {
        "dias": len(dias),
        "trabalhado": fmt_segundos(tot_seg),
        "perdido": tot_perdido,
        "abonado": tot_abonado,
    }


# ---------------------------------------------------------------- calendário / faltas

def justificativa_do_dia(db, func_id, dia):
    return db.execute(
        "SELECT * FROM justificativas WHERE funcionario_id = ? AND dia = ? ORDER BY id DESC LIMIT 1",
        (func_id, dia),
    ).fetchone()


def status_do_dia(db, func, dia):
    """Situação de um dia para o calendário."""
    regs = carrega_dia(db, func["id"], dia)
    if regs:
        seg, _ = trabalhado_do_dia(regs)
        return {"classe": "trabalhado", "rotulo": "Trabalhado", "horas": fmt_segundos(seg)}
    j = justificativa_do_dia(db, func["id"], dia)
    if j and j["status"] == "aprovada":
        return {"classe": "abonada", "rotulo": "Falta abonada", "horas": ""}
    if j and j["status"] == "pendente":
        return {"classe": "pendente", "rotulo": "Em análise", "horas": ""}
    hoje = agora().strftime("%Y-%m-%d")
    if dia > hoje:
        return {"classe": "futuro", "rotulo": "", "horas": ""}
    if date.fromisoformat(dia).weekday() >= 5:   # sábado/domingo
        return {"classe": "fds", "rotulo": "—", "horas": ""}
    return {"classe": "falta", "rotulo": "Falta", "horas": ""}


def mes_delta(mes, delta):
    ano, m = int(mes[:4]), int(mes[5:7]) + delta
    if m < 1:
        m, ano = 12, ano - 1
    elif m > 12:
        m, ano = 1, ano + 1
    return f"{ano:04d}-{m:02d}"


def monta_calendario(db, func, mes):
    """Células do mês (com preenchimento inicial para alinhar Dom–Sáb)."""
    ano, m = int(mes[:4]), int(mes[5:7])
    n_dias = _calendar.monthrange(ano, m)[1]
    offset = (date(ano, m, 1).weekday() + 1) % 7  # Dom=0
    celulas = [None] * offset
    for d in range(1, n_dias + 1):
        dia = f"{ano:04d}-{m:02d}-{d:02d}"
        celulas.append({"num": d, "dia": dia, **status_do_dia(db, func, dia)})
    return celulas


def detalhe_dia(db, func, dia):
    regs = carrega_dia(db, func["id"], dia)
    return {
        "dia": dia,
        "data": date.fromisoformat(dia).strftime("%d/%m/%Y"),
        "status": status_do_dia(db, func, dia),
        "batidas": [{"rotulo": ROTULOS.get(r["tipo"], r["tipo"]), "hora": r["horario"][:5]} for r in regs],
        "tem_batida": bool(regs),
        "justificativa": justificativa_do_dia(db, func["id"], dia),
        "futuro": dia > agora().strftime("%Y-%m-%d"),
    }


# ---------------------------------------------------------------- fluxo do colaborador

def func_logado():
    if "func_id" not in session:
        return None
    return get_db().execute(
        "SELECT * FROM funcionarios WHERE id = ? AND ativo = 1", (session["func_id"],)
    ).fetchone()


def _colaboradores_ativos(db):
    return db.execute(
        "SELECT id, nome FROM funcionarios WHERE ativo = 1 AND papel = 'colaborador' ORDER BY nome"
    ).fetchall()


# ---- app da EMPRESA (dispositivo compartilhado): só bater ponto ----

@app.route("/")
def index():
    return render_template("index.html", pessoas=_colaboradores_ativos(get_db()), modo="empresa")


@app.route("/acessar/<int:func_id>", methods=["GET", "POST"])
def acessar(func_id):
    db = get_db()
    pessoa = db.execute(
        "SELECT * FROM funcionarios WHERE id = ? AND ativo = 1 AND papel = 'colaborador'",
        (func_id,),
    ).fetchone()
    if pessoa is None:
        return redirect(url_for("index"))
    if request.method == "GET":
        return render_template("acessar.html", pessoa=pessoa, modo="empresa")
    pin = request.form.get("pin", "").strip()
    if pin != pessoa["pin"]:
        flash("PIN incorreto. Tente novamente.", "erro")
        return redirect(url_for("acessar", func_id=func_id))
    session["func_id"] = pessoa["id"]
    return redirect(url_for("painel"))


# ---- app do COLABORADOR (celular): só o espelho do mês ----

@app.route("/meu")
def meu():
    return render_template("index.html", pessoas=_colaboradores_ativos(get_db()), modo="colaborador")


@app.route("/meu/acessar/<int:func_id>", methods=["GET", "POST"])
def meu_acessar(func_id):
    db = get_db()
    pessoa = db.execute(
        "SELECT * FROM funcionarios WHERE id = ? AND ativo = 1 AND papel = 'colaborador'",
        (func_id,),
    ).fetchone()
    if pessoa is None:
        return redirect(url_for("meu"))
    if request.method == "GET":
        return render_template("acessar.html", pessoa=pessoa, modo="colaborador")
    pin = request.form.get("pin", "").strip()
    if pin != pessoa["pin"]:
        flash("PIN incorreto. Tente novamente.", "erro")
        return redirect(url_for("meu_acessar", func_id=func_id))
    session["func_id"] = pessoa["id"]
    return redirect(url_for("meu_espelho"))


@app.route("/trocar")
def trocar():
    modo = request.args.get("modo", "empresa")
    session.pop("func_id", None)
    return redirect(url_for("meu") if modo == "colaborador" else url_for("index"))


@app.route("/painel")
def painel():
    func = func_logado()
    if func is None:
        return redirect(url_for("index"))
    db = get_db()
    now = agora()
    dia = now.strftime("%Y-%m-%d")
    regs = carrega_dia(db, func["id"], dia)
    feitos = {r["tipo"]: r["horario"][:5] for r in regs}
    ultimo = regs[-1]["tipo"] if regs else None
    permitidos = PROXIMOS[ultimo]

    etapas = []
    for tipo in ORDEM:
        etapas.append({
            "tipo": tipo,
            "rotulo": ROTULOS[tipo],
            "hora": feitos.get(tipo),
            "permitido": tipo in permitidos,
        })
    encerrado = ultimo == "saida"
    return render_template(
        "painel.html",
        func=func,
        etapas=etapas,
        encerrado=encerrado,
        data=now.strftime("%d/%m/%Y"),
    )


@app.route("/bater/<tipo>", methods=["GET", "POST"])
def bater(tipo):
    func = func_logado()
    if func is None:
        return redirect(url_for("index"))
    if tipo not in ROTULOS:
        return redirect(url_for("painel"))

    db = get_db()
    now = agora()
    dia = now.strftime("%Y-%m-%d")
    regs = carrega_dia(db, func["id"], dia)
    ultimo = regs[-1]["tipo"] if regs else None
    if tipo not in PROXIMOS[ultimo]:
        flash("Esta etapa não está disponível agora.", "erro")
        return redirect(url_for("painel"))

    if request.method == "GET":
        return render_template(
            "bater.html",
            func=func,
            tipo=tipo,
            rotulo=ROTULOS[tipo],
            pode_atrasar=True,
            hora_prevista=func["hora_entrada"] if tipo == "entrada" else None,
        )

    foto = request.form.get("foto") or None
    avisado = 1 if request.form.get("avisado") else 0
    motivo = request.form.get("motivo", "").strip() or None if avisado else None
    # aviso dado na saída da pausa vale para a volta (onde o atraso é calculado)
    if not avisado and tipo in ("volta_almoco", "volta_cafe"):
        par = {"volta_almoco": "saida_almoco", "volta_cafe": "saida_cafe"}[tipo]
        for r in regs:
            if r["tipo"] == par and r["abonado"]:
                avisado, motivo = 1, r["motivo"]
    horario = now.strftime("%H:%M:%S")
    db.execute(
        "INSERT INTO registros (funcionario_id, dia, horario, tipo, foto, abonado, motivo)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (func["id"], dia, horario, tipo, foto, avisado, motivo),
    )
    db.commit()

    # aviso de atraso desta batida
    regs = carrega_dia(db, func["id"], dia)
    for a in atrasos_do_dia(regs, func):
        if a["reg_id"] == regs[-1]["id"] and a["minutos"] > 0:
            if a["abonado"]:
                flash(
                    f"{a['evento']}: excedeu {fmt_minutos(a['minutos'])} "
                    f"({a['detalhe']}) — marcado como avisado e autorizado pelo gestor.",
                    "ok",
                )
            else:
                flash(
                    f"Atenção: {a['evento'].lower()} excedeu {fmt_minutos(a['minutos'])} "
                    f"({a['detalhe']}). Esse tempo será descontado.",
                    "erro",
                )

    if tipo == "saida":
        return redirect(url_for("resumo_dia"))
    flash(f"{ROTULOS[tipo]} registrada às {horario[:5]}.", "ok")
    return redirect(url_for("painel"))


@app.route("/resumo")
def resumo_dia():
    func = func_logado()
    if func is None:
        return redirect(url_for("index"))
    now = agora()
    r = resumo_do_dia(get_db(), func, now.strftime("%Y-%m-%d"))
    return render_template(
        "resumo.html", func=func, r=r, data=now.strftime("%d/%m/%Y"),
        fmt_minutos=fmt_minutos,
    )


@app.route("/contestar/<int:reg_id>", methods=["POST"])
def contestar(reg_id):
    func = func_logado()
    if func is None:
        return redirect(url_for("index"))
    db = get_db()
    reg = db.execute(
        "SELECT * FROM registros WHERE id = ? AND funcionario_id = ?",
        (reg_id, func["id"]),
    ).fetchone()
    if reg is None:
        return redirect(url_for("painel"))
    texto = request.form.get("contestacao", "").strip()
    if not texto:
        flash("Escreva o motivo da contestação.", "erro")
    elif reg["abonado"] or reg["contestacao_status"] == "aprovada":
        flash("Este registro já está abonado.", "ok")
    else:
        db.execute(
            "UPDATE registros SET contestacao = ?, contestacao_status = 'pendente' WHERE id = ?",
            (texto, reg_id),
        )
        db.commit()
        flash("Contestação enviada ao gestor. Aguarde a análise.", "ok")
    return redirect(request.form.get("voltar") or url_for("resumo_dia"))


@app.route("/meu-espelho")
def meu_espelho():
    func = func_logado()
    if func is None:
        flash("Toque no seu nome para ver suas horas.", "erro")
        return redirect(url_for("meu"))
    mes = request.args.get("mes", agora().strftime("%Y-%m"))
    linhas, totais = monta_espelho(get_db(), func, mes)
    return render_template(
        "espelho.html", func=func, mes=mes, linhas=linhas, totais=totais,
        admin=False, voltar_url=url_for("trocar", modo="colaborador"), fmt_minutos=fmt_minutos,
    )


@app.route("/meu-calendario")
def meu_calendario():
    func = func_logado()
    if func is None:
        return redirect(url_for("meu"))
    db = get_db()
    mes = request.args.get("mes", agora().strftime("%Y-%m"))
    dia_sel = request.args.get("dia")
    return render_template(
        "calendario.html", func=func, mes=mes,
        celulas=monta_calendario(db, func, mes),
        dia_sel=dia_sel, detalhe=detalhe_dia(db, func, dia_sel) if dia_sel else None,
        admin=False, voltar_url=url_for("trocar", modo="colaborador"),
        mes_ant=mes_delta(mes, -1), mes_prox=mes_delta(mes, 1),
        hoje_iso=agora().strftime("%Y-%m-%d"),
    )


@app.route("/justificar", methods=["POST"])
def justificar():
    func = func_logado()
    if func is None:
        return redirect(url_for("meu"))
    dia = request.form.get("dia", "")
    texto = request.form.get("texto", "").strip()
    db = get_db()
    if not texto:
        flash("Escreva o motivo da falta.", "erro")
    elif carrega_dia(db, func["id"], dia):
        flash("Este dia já tem registro de ponto.", "erro")
    elif justificativa_do_dia(db, func["id"], dia):
        flash("Você já enviou uma justificativa para este dia.", "ok")
    else:
        db.execute(
            "INSERT INTO justificativas (funcionario_id, dia, texto) VALUES (?, ?, ?)",
            (func["id"], dia, texto),
        )
        db.commit()
        flash("Justificativa enviada ao gestor. Aguarde a análise.", "ok")
    return redirect(url_for("meu_calendario", mes=dia[:7], dia=dia))


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
        "SELECT * FROM funcionarios WHERE papel = 'colaborador' ORDER BY ativo DESC, nome"
    ).fetchall()
    gestor = db.execute(
        "SELECT * FROM funcionarios WHERE papel = 'gestor' ORDER BY id LIMIT 1"
    ).fetchone()

    now = agora()
    dia = now.strftime("%Y-%m-%d")
    hoje, atrasos_hoje = [], []
    for f in funcionarios:
        if not f["ativo"]:
            continue
        regs = carrega_dia(db, f["id"], dia)
        seg, aberto = trabalhado_do_dia(regs)
        if aberto is not None:
            seg += _seg(now.strftime("%H:%M:%S")) - _seg(aberto)
        ultimo = regs[-1]["tipo"] if regs else None
        classe, rotulo = STATUS[ultimo]
        atrasos = atrasos_do_dia(regs, f)
        feitos = {r["tipo"]: r["horario"][:5] for r in regs}
        hoje.append({
            "id": f["id"],
            "nome": f["nome"],
            "classe": classe,
            "rotulo": rotulo,
            "etapas": [feitos.get(t) for t in ORDEM],
            "horas": fmt_segundos(seg),
            "perdido": sum(a["minutos"] for a in atrasos if not a["abonado"]),
        })
        for a in atrasos:
            atrasos_hoje.append({**a, "nome": f["nome"]})

    # contestações pendentes (de qualquer dia)
    contestacoes = []
    nomes = {f["id"]: f["nome"] for f in funcionarios}
    pend = db.execute(
        "SELECT DISTINCT funcionario_id, dia FROM registros WHERE contestacao_status = 'pendente'"
    ).fetchall()
    for p in pend:
        f = db.execute("SELECT * FROM funcionarios WHERE id = ?", (p["funcionario_id"],)).fetchone()
        if f is None:
            continue
        regs = carrega_dia(db, f["id"], p["dia"])
        por_id = {r["id"]: r for r in regs}
        for a in atrasos_do_dia(regs, f):
            if a["contestacao_status"] == "pendente":
                contestacoes.append({
                    **a,
                    "nome": f["nome"],
                    "data": date.fromisoformat(p["dia"]).strftime("%d/%m/%Y"),
                })

    # justificativas de falta pendentes
    faltas_pend = db.execute(
        "SELECT j.id, j.dia, j.texto, f.nome FROM justificativas j"
        " JOIN funcionarios f ON f.id = j.funcionario_id"
        " WHERE j.status = 'pendente' ORDER BY j.dia"
    ).fetchall()
    faltas_pend = [
        {"id": j["id"], "texto": j["texto"], "nome": j["nome"],
         "data": date.fromisoformat(j["dia"]).strftime("%d/%m/%Y")}
        for j in faltas_pend
    ]

    return render_template(
        "admin.html",
        funcionarios=funcionarios,
        gestor=gestor,
        hoje=hoje,
        atrasos_hoje=atrasos_hoje,
        contestacoes=contestacoes,
        faltas_pend=faltas_pend,
        data_hoje=now.strftime("%d/%m/%Y"),
        fmt_minutos=fmt_minutos,
    )


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
    hora_entrada = request.form.get("hora_entrada", "08:00").strip() or "08:00"
    almoco = request.form.get("almoco_min", "60").strip() or "60"
    cafe = request.form.get("cafe_min", "15").strip() or "15"
    if not nome or not pin.isdigit() or not 4 <= len(pin) <= 6:
        flash("Informe um nome e um PIN numérico de 4 a 6 dígitos.", "erro")
        return redirect(url_for("admin"))
    db = get_db()
    try:
        db.execute(
            "INSERT INTO funcionarios (nome, pin, hora_entrada, almoco_min, cafe_min)"
            " VALUES (?, ?, ?, ?, ?)",
            (nome, pin, hora_entrada, int(almoco), int(cafe)),
        )
        db.commit()
        flash(f"{nome} cadastrado(a) com sucesso.", "ok")
    except sqlite3.IntegrityError:
        flash("Este PIN já está em uso — escolha outro.", "erro")
    except ValueError:
        flash("Minutos de almoço e café devem ser números.", "erro")
    return redirect(url_for("admin"))


def _pin_disponivel(db, pin, ignora_id):
    dono = db.execute(
        "SELECT id FROM funcionarios WHERE pin = ? AND id <> ?", (pin, ignora_id)
    ).fetchone()
    return dono is None


@app.route("/admin/funcionarios/<int:func_id>/config", methods=["POST"])
def config_funcionario(func_id):
    if not admin_logado():
        return redirect(url_for("admin"))
    db = get_db()
    pin = request.form.get("pin", "").strip()
    if pin:
        if not (pin.isdigit() and 4 <= len(pin) <= 6):
            flash("O PIN deve ter de 4 a 6 dígitos.", "erro")
            return redirect(url_for("admin"))
        if not _pin_disponivel(db, pin, func_id):
            flash("Este PIN já está em uso — escolha outro.", "erro")
            return redirect(url_for("admin"))
    try:
        db.execute(
            "UPDATE funcionarios SET hora_entrada = ?, almoco_min = ?, cafe_min = ? WHERE id = ?",
            (
                request.form.get("hora_entrada", "08:00"),
                int(request.form.get("almoco_min", 60)),
                int(request.form.get("cafe_min", 15)),
                func_id,
            ),
        )
        if pin:
            db.execute("UPDATE funcionarios SET pin = ? WHERE id = ?", (pin, func_id))
        db.commit()
        flash("Dados do colaborador atualizados." if pin else "Horários atualizados.", "ok")
    except ValueError:
        flash("Minutos de almoço e café devem ser números.", "erro")
    return redirect(url_for("admin"))


@app.route("/admin/minha-senha", methods=["POST"])
def minha_senha():
    if not admin_logado():
        return redirect(url_for("admin"))
    db = get_db()
    gestor = db.execute(
        "SELECT * FROM funcionarios WHERE papel = 'gestor' ORDER BY id LIMIT 1"
    ).fetchone()
    pin = request.form.get("pin", "").strip()
    if gestor is None:
        return redirect(url_for("admin"))
    if not (pin.isdigit() and 4 <= len(pin) <= 6):
        flash("O PIN deve ter de 4 a 6 dígitos.", "erro")
    elif not _pin_disponivel(db, pin, gestor["id"]):
        flash("Este PIN já está em uso — escolha outro.", "erro")
    else:
        db.execute("UPDATE funcionarios SET pin = ? WHERE id = ?", (pin, gestor["id"]))
        db.commit()
        flash("Sua senha de acesso foi atualizada.", "ok")
    return redirect(url_for("admin"))


@app.route("/admin/funcionarios/<int:func_id>/alternar", methods=["POST"])
def alternar_funcionario(func_id):
    if not admin_logado():
        return redirect(url_for("admin"))
    db = get_db()
    db.execute("UPDATE funcionarios SET ativo = 1 - ativo WHERE id = ?", (func_id,))
    db.commit()
    return redirect(url_for("admin"))


@app.route("/admin/abonar/<int:reg_id>", methods=["POST"])
def abonar(reg_id):
    if not admin_logado():
        return redirect(url_for("admin"))
    db = get_db()
    db.execute("UPDATE registros SET abonado = 1 - abonado WHERE id = ?", (reg_id,))
    db.commit()
    return redirect(request.form.get("voltar") or url_for("admin"))


@app.route("/admin/contestacao/<int:reg_id>/<acao>", methods=["POST"])
def responder_contestacao(reg_id, acao):
    if not admin_logado():
        return redirect(url_for("admin"))
    db = get_db()
    if acao == "aprovar":
        db.execute(
            "UPDATE registros SET abonado = 1, contestacao_status = 'aprovada' WHERE id = ?",
            (reg_id,),
        )
    elif acao == "recusar":
        db.execute(
            "UPDATE registros SET abonado = 0, contestacao_status = 'recusada' WHERE id = ?",
            (reg_id,),
        )
    db.commit()
    return redirect(request.form.get("voltar") or url_for("admin"))


@app.route("/admin/justificativa/<int:jid>/<acao>", methods=["POST"])
def responder_justificativa(jid, acao):
    if not admin_logado():
        return redirect(url_for("admin"))
    db = get_db()
    novo = "aprovada" if acao == "aprovar" else "recusada"
    db.execute("UPDATE justificativas SET status = ? WHERE id = ?", (novo, jid))
    db.commit()
    return redirect(request.form.get("voltar") or url_for("admin"))


@app.route("/admin/calendario/<int:func_id>")
def admin_calendario(func_id):
    if not admin_logado():
        return redirect(url_for("admin"))
    db = get_db()
    func = db.execute("SELECT * FROM funcionarios WHERE id = ?", (func_id,)).fetchone()
    if func is None:
        return redirect(url_for("admin"))
    mes = request.args.get("mes", agora().strftime("%Y-%m"))
    dia_sel = request.args.get("dia")
    return render_template(
        "calendario.html", func=func, mes=mes,
        celulas=monta_calendario(db, func, mes),
        dia_sel=dia_sel, detalhe=detalhe_dia(db, func, dia_sel) if dia_sel else None,
        admin=True, voltar_url=url_for("admin"),
        mes_ant=mes_delta(mes, -1), mes_prox=mes_delta(mes, 1),
        hoje_iso=agora().strftime("%Y-%m-%d"),
    )


@app.route("/admin/espelho/<int:func_id>")
def espelho(func_id):
    if not admin_logado():
        return redirect(url_for("admin"))
    db = get_db()
    func = db.execute("SELECT * FROM funcionarios WHERE id = ?", (func_id,)).fetchone()
    if func is None:
        return redirect(url_for("admin"))
    mes = request.args.get("mes", agora().strftime("%Y-%m"))
    linhas, totais = monta_espelho(db, func, mes)
    return render_template(
        "espelho.html", func=func, mes=mes, linhas=linhas, totais=totais,
        admin=True, voltar_url=url_for("admin"), fmt_minutos=fmt_minutos,
    )


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
