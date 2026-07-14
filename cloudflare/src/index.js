// Ponto WISE — Worker Cloudflare (API + D1)
// Serve a interface (public/) e uma API JSON com banco D1.

const PROXIMOS = {
  "": ["entrada"],
  entrada: ["saida_almoco", "saida"],
  saida_almoco: ["volta_almoco"],
  volta_almoco: ["saida_cafe", "saida"],
  saida_cafe: ["volta_cafe"],
  volta_cafe: ["saida"],
  saida: [],
};

// ---------------------------------------------------------------- utilidades

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function agoraSP() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hora = p.hour === "24" ? "00" : p.hour;
  return { dia: `${p.year}-${p.month}-${p.day}`, horario: `${hora}:${p.minute}:${p.second}` };
}

// ---- token (HMAC) ----
function b64url(bytes) {
  let s = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function criarToken(secret, payload) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${b64url(sig)}`;
}
async function lerToken(secret, token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sig), new TextEncoder().encode(body));
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
function tokenDaRequest(request) {
  const h = request.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// ---------------------------------------------------------------- API

async function handleApi(request, env, url) {
  const secret = env.PONTO_SECRET || "dev-secret";
  const path = url.pathname;
  const method = request.method;
  const body = method === "POST" ? await request.json().catch(() => ({})) : {};

  const auth = async (papel) => {
    const p = await lerToken(secret, tokenDaRequest(request));
    if (!p) return null;
    if (papel && p.role !== papel) return null;
    return p;
  };

  try {
    // ---- público
    if (path === "/api/info" && method === "GET") {
      const g = await env.DB.prepare("SELECT nome FROM funcionarios WHERE papel='gestor' ORDER BY id LIMIT 1").first();
      return json({ gestor_nome: g ? g.nome : "Gestor" });
    }
    if (path === "/api/pessoas" && method === "GET") {
      const r = await env.DB.prepare(
        "SELECT id, nome, ativo, papel FROM funcionarios WHERE ativo=1 AND papel='colaborador' ORDER BY nome").all();
      return json({ pessoas: r.results });
    }
    if (path === "/api/login" && method === "POST") {
      const f = await env.DB.prepare(
        "SELECT * FROM funcionarios WHERE id=? AND ativo=1 AND papel='colaborador'").bind(body.func_id).first();
      if (!f || String(body.pin) !== String(f.pin)) return json({ erro: "PIN incorreto." }, 401);
      const token = await criarToken(secret, { role: "colaborador", fid: f.id, exp: Date.now() + 12 * 3600e3 });
      return json({ token, func: pubFunc(f) });
    }
    if (path === "/api/login-gestor" && method === "POST") {
      const g = await env.DB.prepare("SELECT * FROM funcionarios WHERE papel='gestor' ORDER BY id LIMIT 1").first();
      const okPin = g && String(body.pin) === String(g.pin);
      const okSenha = env.PONTO_ADMIN_SENHA && String(body.pin) === String(env.PONTO_ADMIN_SENHA);
      if (!okPin && !okSenha) return json({ erro: "PIN incorreto." }, 401);
      const token = await criarToken(secret, { role: "gestor", exp: Date.now() + 12 * 3600e3 });
      return json({ token, nome: g ? g.nome : "Gestor" });
    }

    // ---- liberar o aparelho da empresa (bater ponto) com o código do gestor
    if (path === "/api/liberar-aparelho" && method === "POST") {
      const c = await env.DB.prepare("SELECT valor FROM config WHERE chave='aparelho_codigo'").first();
      const codigo = c ? c.valor : "4321";
      if (String(body.codigo || "") !== String(codigo)) return json({ erro: "Código incorreto." }, 401);
      const token = await criarToken(secret, { role: "dispositivo", exp: Date.now() + 365 * 24 * 3600e3 });
      return json({ token });
    }

    // ---- colaborador
    if (path === "/api/meu" && method === "GET") {
      const p = await auth("colaborador");
      if (!p) return json({ erro: "sessão" }, 401);
      return json(await estadoColaborador(env, p.fid));
    }
    if (path === "/api/bater" && method === "POST") {
      const p = await auth("colaborador");
      if (!p) return json({ erro: "sessão" }, 401);
      // trava do aparelho: só um aparelho liberado pode bater ponto
      const disp = await lerToken(secret, request.headers.get("x-dispositivo"));
      if (!disp || disp.role !== "dispositivo") return json({ erro: "aparelho-nao-liberado" }, 403);
      return await baterPonto(env, p.fid, body);
    }
    if (path === "/api/contestar" && method === "POST") {
      const p = await auth("colaborador");
      if (!p) return json({ erro: "sessão" }, 401);
      const reg = await env.DB.prepare("SELECT * FROM registros WHERE id=? AND funcionario_id=?")
        .bind(body.reg_id, p.fid).first();
      if (!reg) return json({ erro: "registro" }, 404);
      if (!body.texto || !body.texto.trim()) return json({ erro: "texto" }, 400);
      if (!reg.abonado && reg.contestacao_status !== "aprovada") {
        await env.DB.prepare("UPDATE registros SET contestacao=?, contestacao_status='pendente' WHERE id=?")
          .bind(body.texto.trim(), reg.id).run();
      }
      return json({ ok: true });
    }
    if (path === "/api/justificar" && method === "POST") {
      const p = await auth("colaborador");
      if (!p) return json({ erro: "sessão" }, 401);
      const dia = body.dia, texto = (body.texto || "").trim();
      if (!dia || !texto) return json({ erro: "dados" }, 400);
      const temReg = await env.DB.prepare("SELECT 1 FROM registros WHERE funcionario_id=? AND dia=? LIMIT 1")
        .bind(p.fid, dia).first();
      if (temReg) return json({ erro: "Este dia tem registro de ponto." }, 400);
      const jaTem = await env.DB.prepare("SELECT 1 FROM justificativas WHERE funcionario_id=? AND dia=? LIMIT 1")
        .bind(p.fid, dia).first();
      if (!jaTem) {
        await env.DB.prepare("INSERT INTO justificativas (funcionario_id, dia, texto) VALUES (?,?,?)")
          .bind(p.fid, dia, texto).run();
      }
      return json({ ok: true });
    }

    // ---- gestor
    if (path === "/api/admin" && method === "GET") {
      if (!(await auth("gestor"))) return json({ erro: "sessão" }, 401);
      return json(await estadoAdmin(env));
    }
    if (path === "/api/admin/colaborador" && method === "POST") {
      if (!(await auth("gestor"))) return json({ erro: "sessão" }, 401);
      const { nome, pin } = body;
      if (!nome || !/^\d{4,6}$/.test(String(pin))) return json({ erro: "Nome e PIN de 4 a 6 dígitos." }, 400);
      try {
        await env.DB.prepare(
          "INSERT INTO funcionarios (nome, pin, hora_entrada, hora_saida, almoco_min, cafe_min, salario, horas_mes) VALUES (?,?,?,?,?,?,?,?)")
          .bind(nome.trim(), String(pin), body.hora_entrada || "08:00", body.hora_saida || "18:00",
            parseInt(body.almoco_min) || 60, parseInt(body.cafe_min) || 15,
            Number(body.salario) || 0, Number(body.horas_mes) || 220).run();
      } catch { return json({ erro: "Este PIN já está em uso." }, 400); }
      return json({ ok: true });
    }
    if (path === "/api/admin/colaborador-config" && method === "POST") {
      if (!(await auth("gestor"))) return json({ erro: "sessão" }, 401);
      const pin = String(body.pin || "");
      if (pin) {
        if (!/^\d{4,6}$/.test(pin)) return json({ erro: "PIN de 4 a 6 dígitos." }, 400);
        const dono = await env.DB.prepare("SELECT 1 FROM funcionarios WHERE pin=? AND id<>?").bind(pin, body.id).first();
        if (dono) return json({ erro: "Este PIN já está em uso." }, 400);
      }
      await env.DB.prepare(
        "UPDATE funcionarios SET hora_entrada=?, hora_saida=?, almoco_min=?, salario=?, horas_mes=? WHERE id=?")
        .bind(body.hora_entrada || "08:00", body.hora_saida || "18:00", parseInt(body.almoco_min) || 60,
          Number(body.salario) || 0, Number(body.horas_mes) || 220, body.id).run();
      if (pin) await env.DB.prepare("UPDATE funcionarios SET pin=? WHERE id=?").bind(pin, body.id).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/colaborador-alternar" && method === "POST") {
      if (!(await auth("gestor"))) return json({ erro: "sessão" }, 401);
      await env.DB.prepare("UPDATE funcionarios SET ativo=1-ativo WHERE id=? AND papel='colaborador'").bind(body.id).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/gestor-senha" && method === "POST") {
      if (!(await auth("gestor"))) return json({ erro: "sessão" }, 401);
      const pin = String(body.pin || "");
      if (!/^\d{4,6}$/.test(pin)) return json({ erro: "PIN de 4 a 6 dígitos." }, 400);
      const dono = await env.DB.prepare("SELECT 1 FROM funcionarios WHERE pin=? AND papel<>'gestor'").bind(pin).first();
      if (dono) return json({ erro: "Este PIN já está em uso." }, 400);
      await env.DB.prepare("UPDATE funcionarios SET pin=? WHERE papel='gestor'").bind(pin).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/abonar" && method === "POST") {
      if (!(await auth("gestor"))) return json({ erro: "sessão" }, 401);
      // ao abonar, cancela a compensação (são exclusivos)
      await env.DB.prepare(
        "UPDATE registros SET abonado=1-abonado, compensar=CASE WHEN abonado=0 THEN 0 ELSE compensar END WHERE id=?")
        .bind(body.reg_id).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/compensar" && method === "POST") {
      if (!(await auth("gestor"))) return json({ erro: "sessão" }, 401);
      // marcar "compensar na saída" cancela o abono (são exclusivos)
      await env.DB.prepare(
        "UPDATE registros SET compensar=1-compensar, abonado=CASE WHEN compensar=0 THEN 0 ELSE abonado END WHERE id=?")
        .bind(body.reg_id).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/contestacao" && method === "POST") {
      if (!(await auth("gestor"))) return json({ erro: "sessão" }, 401);
      if (body.acao === "aprovar")
        await env.DB.prepare("UPDATE registros SET abonado=1, contestacao_status='aprovada' WHERE id=?").bind(body.reg_id).run();
      else
        await env.DB.prepare("UPDATE registros SET abonado=0, contestacao_status='recusada' WHERE id=?").bind(body.reg_id).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/justificativa" && method === "POST") {
      if (!(await auth("gestor"))) return json({ erro: "sessão" }, 401);
      const novo = body.acao === "aprovar" ? "aprovada" : "recusada";
      await env.DB.prepare("UPDATE justificativas SET status=? WHERE id=?").bind(novo, body.id).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/notificacao" && method === "POST") {
      if (!(await auth("gestor"))) return json({ erro: "sessão" }, 401);
      if (!body.funcionario_id || !body.horario || !body.mensagem) return json({ erro: "dados" }, 400);
      await env.DB.prepare("INSERT INTO notificacoes (funcionario_id, horario, mensagem) VALUES (?,?,?)")
        .bind(body.funcionario_id, body.horario, String(body.mensagem).trim()).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/notificacao-remover" && method === "POST") {
      if (!(await auth("gestor"))) return json({ erro: "sessão" }, 401);
      await env.DB.prepare("DELETE FROM notificacoes WHERE id=?").bind(body.id).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/aparelho-codigo" && method === "POST") {
      if (!(await auth("gestor"))) return json({ erro: "sessão" }, 401);
      const codigo = String(body.codigo || "").trim();
      if (!codigo) return json({ erro: "Informe um código." }, 400);
      await env.DB.prepare(
        "INSERT INTO config (chave, valor) VALUES ('aparelho_codigo', ?) ON CONFLICT(chave) DO UPDATE SET valor=?")
        .bind(codigo, codigo).run();
      return json({ ok: true });
    }

    return json({ erro: "rota não encontrada" }, 404);
  } catch (e) {
    return json({ erro: String(e && e.message || e) }, 500);
  }
}

function pubFunc(f) {
  // dados que o colaborador pode ver (salário e carga NÃO entram aqui)
  return {
    id: f.id, nome: f.nome, papel: f.papel, ativo: f.ativo,
    hora_entrada: f.hora_entrada, hora_saida: f.hora_saida,
    almoco_min: f.almoco_min, cafe_min: f.cafe_min,
  };
}

async function estadoColaborador(env, fid) {
  const func = await env.DB.prepare("SELECT * FROM funcionarios WHERE id=?").bind(fid).first();
  const registros = (await env.DB.prepare("SELECT * FROM registros WHERE funcionario_id=? ORDER BY dia, horario").bind(fid).all()).results;
  const justificativas = (await env.DB.prepare("SELECT * FROM justificativas WHERE funcionario_id=?").bind(fid).all()).results;
  const notificacoes = (await env.DB.prepare("SELECT * FROM notificacoes WHERE funcionario_id=? ORDER BY horario").bind(fid).all()).results;
  const pessoas = (await env.DB.prepare("SELECT id, nome, ativo, papel FROM funcionarios WHERE ativo=1 AND papel='colaborador' ORDER BY nome").all()).results;
  return { func: pubFunc(func), pessoas, registros, justificativas, notificacoes };
}

async function estadoAdmin(env) {
  const funcionarios = (await env.DB.prepare("SELECT * FROM funcionarios ORDER BY ativo DESC, nome").all()).results;
  const registros = (await env.DB.prepare("SELECT * FROM registros ORDER BY dia, horario").all()).results;
  const justificativas = (await env.DB.prepare("SELECT * FROM justificativas").all()).results;
  const notificacoes = (await env.DB.prepare("SELECT * FROM notificacoes ORDER BY horario").all()).results;
  const cfg = await env.DB.prepare("SELECT valor FROM config WHERE chave='aparelho_codigo'").first();
  return { funcionarios, registros, justificativas, notificacoes, aparelho_codigo: cfg ? cfg.valor : "4321" };
}

async function baterPonto(env, fid, body) {
  const func = await env.DB.prepare("SELECT * FROM funcionarios WHERE id=?").bind(fid).first();
  const { dia, horario } = agoraSP();
  const regs = (await env.DB.prepare(
    "SELECT * FROM registros WHERE funcionario_id=? AND dia=? ORDER BY horario, id").bind(fid, dia).all()).results;
  const ultimo = regs.length ? regs[regs.length - 1].tipo : "";
  const tipo = body.tipo;
  if (!(PROXIMOS[ultimo] || []).includes(tipo)) return json({ erro: "Esta etapa não está disponível agora." }, 400);

  let abonado = body.avisado ? 1 : 0;
  let motivo = abonado ? (body.motivo || "").trim() || null : null;
  if (!abonado && (tipo === "volta_almoco" || tipo === "volta_cafe")) {
    const par = tipo === "volta_almoco" ? "saida_almoco" : "saida_cafe";
    const r = regs.find((x) => x.tipo === par && x.abonado);
    if (r) { abonado = 1; motivo = r.motivo; }
  }
  await env.DB.prepare(
    "INSERT INTO registros (funcionario_id, dia, horario, tipo, foto, abonado, motivo) VALUES (?,?,?,?,?,?,?)")
    .bind(fid, dia, horario, tipo, body.foto || null, abonado, motivo).run();
  return json({ ok: true, horario });
}

// ---------------------------------------------------------------- entrada

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    // qualquer outra rota (/, /meu, /admin) → serve a interface (index.html na raiz)
    const res = await env.ASSETS.fetch(new Request(new URL("/", url.origin), { headers: request.headers }));
    return new Response(res.body, {
      status: res.status,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
