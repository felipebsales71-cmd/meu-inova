const encoder = new TextEncoder();

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  cpf TEXT UNIQUE,
  phone TEXT,
  registration TEXT NOT NULL UNIQUE,
  course TEXT,
  period TEXT,
  campus TEXT,
  monthly_fee REAL NOT NULL DEFAULT 0,
  access INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount_due REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pendente',
  paid_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_student_due ON payments(student_id, due_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status_due ON payments(status, due_date);

CREATE TABLE IF NOT EXISTS student_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT,
  status TEXT NOT NULL DEFAULT 'Em análise',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_student ON student_requests(student_id, id DESC);

CREATE TABLE IF NOT EXISTS notification_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  email_enabled INTEGER NOT NULL DEFAULT 1,
  sms_enabled INTEGER NOT NULL DEFAULT 0,
  whatsapp_enabled INTEGER NOT NULL DEFAULT 0,
  staff_email TEXT,
  staff_phone TEXT,
  days_after_due INTEGER NOT NULL DEFAULT 1,
  repeat_days INTEGER NOT NULL DEFAULT 3,
  dry_run INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id TEXT NOT NULL,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  destination TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_payment_channel ON notification_logs(payment_id, channel, created_at DESC);

CREATE TABLE IF NOT EXISTS reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reset_token_hash ON reset_tokens(token_hash);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_role TEXT NOT NULL,
  actor_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(id DESC);

INSERT OR IGNORE INTO notification_settings (
  id, email_enabled, sms_enabled, whatsapp_enabled, staff_email, staff_phone,
  days_after_due, repeat_days, dry_run, updated_at
) VALUES (1, 1, 0, 0, '', '', 1, 3, 1, '2026-08-11T00:00:00.000Z');

`;

let schemaReady = null;
async function ensureSchema(env) {
  if (!env.DB) throw new HttpError(500, "Banco D1 não vinculado ao Worker.");
  if (!schemaReady) {
    schemaReady = env.DB.exec(SCHEMA_SQL).catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

function error(message, status = 400) {
  return json({ detail: message }, status);
}

async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Corpo JSON inválido.");
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function localDateISO(env, date = new Date()) {
  const timeZone = env.APP_TIMEZONE || "America/Cuiaba";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function localDateTimeBR(env, iso) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: env.APP_TIMEZONE || "America/Cuiaba",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function daysBetween(a, b) {
  const aa = Date.parse(`${a}T00:00:00Z`);
  const bb = Date.parse(`${b}T00:00:00Z`);
  return Math.floor((bb - aa) / 86400000);
}

function b64urlBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlText(text) {
  return b64urlBytes(encoder.encode(text));
}

function bytesFromB64url(value) {
  const base = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(base);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function textFromB64url(value) {
  return new TextDecoder().decode(bytesFromB64url(value));
}

async function sha256Hex(text) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password) {
  const iterations = 210000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return `pbkdf2_sha256$${iterations}$${b64urlBytes(salt)}$${b64urlBytes(new Uint8Array(bits))}`;
}

async function verifyPassword(password, encodedHash) {
  if (!encodedHash) return false;
  try {
    const [algo, rounds, salt64, expected64] = encodedHash.split("$");
    if (algo !== "pbkdf2_sha256") return false;
    const salt = bytesFromB64url(salt64);
    const expected = bytesFromB64url(expected64);
    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: Number(rounds), hash: "SHA-256" },
      keyMaterial,
      256,
    );
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

async function makeSessionToken(env, role, id) {
  if (!env.SESSION_SECRET) throw new HttpError(500, "SESSION_SECRET não configurado no Cloudflare.");
  const hours = Math.max(1, Number(env.SESSION_HOURS || 12));
  const payload = {
    role,
    id: Number(id),
    exp: Math.floor(Date.now() / 1000) + hours * 3600,
  };
  const body = b64urlText(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return `${body}.${b64urlBytes(sig)}`;
}

async function parseSessionToken(env, token) {
  if (!env.SESSION_SECRET) throw new HttpError(500, "SESSION_SECRET não configurado no Cloudflare.");
  try {
    const [body, sig64] = String(token || "").split(".");
    if (!body || !sig64) throw new Error("format");
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify("HMAC", key, bytesFromB64url(sig64), encoder.encode(body));
    if (!ok) throw new Error("signature");
    const payload = JSON.parse(textFromB64url(body));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
    return payload;
  } catch {
    throw new HttpError(401, "Sessão inválida ou expirada.");
  }
}

async function currentUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new HttpError(401, "Autenticação necessária.");
  return parseSessionToken(env, auth.slice(7));
}

async function requireRole(request, env, role) {
  const user = await currentUser(request, env);
  if (user.role !== role) {
    throw new HttpError(403, role === "admin" ? "Acesso administrativo necessário." : "Acesso de aluno necessário.");
  }
  return user;
}

function studentRow(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    cpf: r.cpf,
    phone: r.phone,
    registration: r.registration,
    course: r.course,
    period: r.period,
    campus: r.campus,
    monthlyFee: Number(r.monthly_fee || 0),
    access: Boolean(r.access),
  };
}

function paymentRow(r) {
  return {
    id: r.id,
    studentId: r.student_id,
    desc: r.description,
    due: r.due_date,
    amountDue: Number(r.amount_due || 0),
    amountPaid: Number(r.amount_paid || 0),
    status: r.status,
  };
}

async function audit(env, actorRole, actorId, action, entity = null, entityId = null, details = null) {
  await env.DB.prepare(
    `INSERT INTO audit_log(actor_role,actor_id,action,entity,entity_id,details,created_at)
     VALUES(?,?,?,?,?,?,?)`,
  )
    .bind(
      actorRole,
      actorId ?? null,
      action,
      entity,
      entityId == null ? null : String(entityId),
      details == null ? null : JSON.stringify(details),
      nowIso(),
    )
    .run();
}

async function refreshPaymentStatuses(env, paymentId = null) {
  const today = localDateISO(env);
  const result = paymentId
    ? await env.DB.prepare("SELECT * FROM payments WHERE id = ?").bind(paymentId).all()
    : await env.DB.prepare("SELECT * FROM payments").all();
  const statements = [];
  for (const p of result.results || []) {
    let status = "Pendente";
    if (Number(p.amount_paid) >= Number(p.amount_due)) status = "Pago";
    else if (p.due_date < today) status = "Atrasado";
    if (status !== p.status) {
      statements.push(env.DB.prepare("UPDATE payments SET status = ? WHERE id = ?").bind(status, p.id));
    }
  }
  if (statements.length) await env.DB.batch(statements);
}

async function createResetToken(env, role, userId) {
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = b64urlBytes(rawBytes);
  const digest = await sha256Hex(token);
  const minutes = Math.max(5, Number(env.RESET_TOKEN_MINUTES || 30));
  const expiresAt = new Date(Date.now() + minutes * 60000).toISOString();
  await env.DB.prepare(
    "INSERT INTO reset_tokens(role,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
  )
    .bind(role, userId, digest, expiresAt, nowIso())
    .run();
  return token;
}

function baseUrl(request, env) {
  if (env.APP_BASE_URL) return String(env.APP_BASE_URL).replace(/\/$/, "");
  return new URL(request.url).origin;
}

async function sendEmailResend(env, to, subject, text) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurada");
  const from = env.MAIL_FROM || "Meu Inova <noreply@example.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) throw new Error(`E-mail recusado pelo provedor (${response.status}).`);
  return response.json();
}

async function sendTwilioSms(env, to, text) {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_SMS_FROM;
  if (!sid || !token || !from) throw new Error("Credenciais Twilio SMS não configuradas");
  const form = new URLSearchParams({ To: to, From: from, Body: text });
  const auth = btoa(`${sid}:${token}`);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: form.toString(),
  });
  if (!response.ok) throw new Error(`SMS recusado pelo provedor (${response.status}).`);
  return response.json();
}

async function sendWhatsApp(env, to, text) {
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
  const version = env.WHATSAPP_GRAPH_VERSION;
  const template = env.WHATSAPP_TEMPLATE_NAME;
  const language = env.WHATSAPP_TEMPLATE_LANG || "pt_BR";
  if (!token || !phoneId || !version || !template) {
    throw new Error("Credenciais ou template do WhatsApp Cloud API não configurados");
  }
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: String(to).replace(/\D/g, ""),
      type: "template",
      template: {
        name: template,
        language: { code: language },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: text.slice(0, 900) }],
          },
        ],
      },
    }),
  });
  if (!response.ok) throw new Error(`WhatsApp recusado pelo provedor (${response.status}).`);
  return response.json();
}

async function sendResetEmail(request, env, email, token, purpose = "redefinição") {
  const minutes = Math.max(5, Number(env.RESET_TOKEN_MINUTES || 30));
  const link = `${baseUrl(request, env)}/reset.html?token=${encodeURIComponent(token)}`;
  const text = `Foi solicitada a ${purpose} da senha no Meu Inova. Use este link, válido por ${minutes} minutos: ${link}`;
  if (!env.RESEND_API_KEY) return { sent: false, reason: "email_provider_not_configured" };
  try {
    await sendEmailResend(env, email, "Meu Inova - redefinição de senha", text);
    return { sent: true };
  } catch (e) {
    console.error("reset-email", e);
    return { sent: false, reason: String(e?.message || e) };
  }
}

function splitDestinations(value) {
  return String(value || "")
    .replace(/;/g, ",")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function processOverdueNotifications(env, force = false) {
  await refreshPaymentStatuses(env);
  const cfg = await env.DB.prepare("SELECT * FROM notification_settings WHERE id = 1").first();
  if (!cfg) throw new Error("Configuração de notificações não encontrada.");
  const today = localDateISO(env);
  const overdue = await env.DB.prepare(
    `SELECT p.*, s.name AS student_name, s.registration
       FROM payments p
       JOIN students s ON s.id = p.student_id
      WHERE p.amount_paid < p.amount_due AND p.status = 'Atrasado'
      ORDER BY p.due_date ASC`,
  ).all();

  const channels = [];
  if (cfg.email_enabled) {
    for (const dest of splitDestinations(cfg.staff_email)) channels.push(["E-mail", dest]);
  }
  if (cfg.sms_enabled) {
    for (const dest of splitDestinations(cfg.staff_phone)) channels.push(["SMS", dest]);
  }
  if (cfg.whatsapp_enabled) {
    for (const dest of splitDestinations(cfg.staff_phone)) channels.push(["WhatsApp", dest]);
  }

  let eligible = 0;
  let processed = 0;
  const dryRun = Boolean(cfg.dry_run);
  for (const p of overdue.results || []) {
    const daysLate = daysBetween(p.due_date, today);
    if (daysLate < Number(cfg.days_after_due || 0)) continue;
    eligible += 1;
    const remaining = Number(p.amount_due) - Number(p.amount_paid);
    const message = `Meu Inova: mensalidade em atraso. Aluno: ${p.student_name}; matrícula: ${p.registration}; vencimento: ${p.due_date}; dias em atraso: ${daysLate}; saldo: R$ ${remaining.toFixed(2).replace(".", ",")}.`;

    for (const [channel, destination] of channels) {
      const last = await env.DB.prepare(
        `SELECT created_at FROM notification_logs
          WHERE payment_id = ? AND channel = ? AND destination = ?
            AND status IN ('Enviado','Simulado')
          ORDER BY id DESC LIMIT 1`,
      ).bind(p.id, channel, destination).first();

      if (!force && last) {
        const elapsedDays = Math.floor((Date.now() - Date.parse(last.created_at)) / 86400000);
        if (elapsedDays < Math.max(1, Number(cfg.repeat_days || 3))) continue;
      }

      let status = dryRun ? "Simulado" : "Enviado";
      let err = null;
      try {
        if (!dryRun) {
          if (channel === "E-mail") await sendEmailResend(env, destination, "Meu Inova - aluno inadimplente", message);
          else if (channel === "SMS") await sendTwilioSms(env, destination, message);
          else if (channel === "WhatsApp") await sendWhatsApp(env, destination, message);
        }
      } catch (e) {
        status = "Falha";
        err = String(e?.message || e).slice(0, 500);
      }

      await env.DB.prepare(
        `INSERT INTO notification_logs(payment_id,student_id,channel,destination,status,error,created_at)
         VALUES(?,?,?,?,?,?,?)`,
      ).bind(p.id, p.student_id, channel, destination, status, err, nowIso()).run();
      processed += 1;
    }
  }

  return { overdue: eligible, notifications: processed, dryRun };
}

async function handleSetup(request, env) {
  const data = await bodyJson(request);
  if (!env.SETUP_TOKEN) throw new HttpError(500, "SETUP_TOKEN não configurado no Cloudflare.");
  const supplied = request.headers.get("x-setup-token") || data.setupToken || "";
  if (supplied !== env.SETUP_TOKEN) throw new HttpError(403, "Chave de instalação inválida.");
  const existing = await env.DB.prepare("SELECT COUNT(*) AS total FROM admins").first();
  if (Number(existing?.total || 0) > 0) throw new HttpError(409, "A instalação inicial já foi concluída.");

  const adminName = String(data.adminName || "").trim();
  const adminEmail = String(data.adminEmail || "").trim().toLowerCase();
  const adminPassword = String(data.adminPassword || "");
  if (!adminName || !adminEmail || !adminEmail.includes("@")) throw new HttpError(400, "Informe nome e e-mail administrativo válidos.");
  if (adminPassword.length < 10) throw new HttpError(400, "A senha administrativa deve ter pelo menos 10 caracteres.");

  const demo = data.demoStudent;
  let demoHash = null;
  if (demo && demo.enabled) {
    const demoPassword = String(demo.password || "");
    if (demoPassword.length < 6) throw new HttpError(400, "A senha do aluno de teste deve ter pelo menos 6 caracteres.");
    if (!String(demo.email || "").includes("@")) throw new HttpError(400, "Informe um e-mail válido para o aluno de teste.");
    if (!String(demo.registration || "").trim()) throw new HttpError(400, "Informe a matrícula do aluno de teste.");
    demoHash = await hashPassword(demoPassword);
  }

  const adminHash = await hashPassword(adminPassword);
  const adminInsert = await env.DB.prepare(
    "INSERT INTO admins(name,email,password_hash,active,created_at) VALUES(?,?,?,1,?)",
  ).bind(adminName, adminEmail, adminHash, nowIso()).run();
  const adminId = adminInsert.meta.last_row_id;
  await audit(env, "system", null, "initial_setup", "admin", adminId, { email: adminEmail });

  let demoStudent = null;
  if (demo && demo.enabled) {
    const hash = demoHash;
    const ins = await env.DB.prepare(
      `INSERT INTO students(name,email,cpf,phone,registration,course,period,campus,monthly_fee,access,password_hash,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,1,?,?)`,
    ).bind(
      String(demo.name || "Aluno de Teste"),
      String(demo.email || "aluno@inova.edu.br").toLowerCase(),
      demo.cpf || null,
      demo.phone || null,
      String(demo.registration || "TESTE001"),
      String(demo.course || "Curso de Teste"),
      String(demo.period || "1º Módulo"),
      String(demo.campus || "Unidade Centro"),
      Number(demo.monthlyFee || 450),
      hash,
      nowIso(),
    ).run();
    const sid = ins.meta.last_row_id;
    demoStudent = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(sid).first();
    const due = localDateISO(env, new Date(Date.now() - 2 * 86400000));
    const pid = `TESTE-${Date.now()}`;
    await env.DB.prepare(
      `INSERT INTO payments(id,student_id,description,due_date,amount_due,amount_paid,status,created_at)
       VALUES(?,?,?,?,?,0,'Atrasado',?)`,
    ).bind(pid, sid, "Mensalidade de teste", due, Number(demo.monthlyFee || 450), nowIso()).run();
  }

  return json({
    message: "Instalação inicial concluída.",
    admin: { id: adminId, name: adminName, email: adminEmail },
    demoStudent: demoStudent ? studentRow(demoStudent) : null,
  });
}

async function routeApi(request, env) {
  await ensureSchema(env);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") return new Response(null, { status: 204 });

  if (path === "/api/health" && method === "GET") {
    const db = await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ ok: db?.ok === 1, service: "Meu Inova", date: localDateISO(env) });
  }

  if (path === "/api/system/status" && method === "GET") {
    const admins = await env.DB.prepare("SELECT COUNT(*) AS total FROM admins").first();
    return json({ configured: Number(admins?.total || 0) > 0, hasEmailProvider: Boolean(env.RESEND_API_KEY) });
  }

  if (path === "/api/setup" && method === "POST") return handleSetup(request, env);

  if (path === "/api/auth/student/login" && method === "POST") {
    const data = await bodyJson(request);
    const identifier = String(data.identifier || "").trim();
    const s = await env.DB.prepare(
      "SELECT * FROM students WHERE lower(email)=lower(?) OR cpf=? OR registration=? LIMIT 1",
    ).bind(identifier, identifier, identifier).first();
    if (!s || !(await verifyPassword(String(data.password || ""), s.password_hash))) throw new HttpError(401, "Usuário ou senha inválidos.");
    if (!s.access) throw new HttpError(403, "Seu acesso ao portal está suspenso. Procure a secretaria.");
    const token = await makeSessionToken(env, "student", s.id);
    return json({ token, user: studentRow(s) });
  }

  if (path === "/api/auth/admin/login" && method === "POST") {
    const data = await bodyJson(request);
    const identifier = String(data.identifier || "").trim().toLowerCase();
    const a = await env.DB.prepare("SELECT * FROM admins WHERE lower(email)=? LIMIT 1").bind(identifier).first();
    if (!a || !a.active || !(await verifyPassword(String(data.password || ""), a.password_hash))) {
      throw new HttpError(401, "Credenciais administrativas inválidas.");
    }
    const token = await makeSessionToken(env, "admin", a.id);
    return json({ token, user: { id: a.id, name: a.name, email: a.email, role: "Administrador" } });
  }

  if (path === "/api/auth/forgot-password" && method === "POST") {
    const data = await bodyJson(request);
    const role = data.role === "admin" ? "admin" : "student";
    const identifier = String(data.identifier || "").trim();
    let row = null;
    if (role === "student") {
      row = await env.DB.prepare(
        "SELECT id,email FROM students WHERE lower(email)=lower(?) OR cpf=? OR registration=? LIMIT 1",
      ).bind(identifier, identifier, identifier).first();
    } else {
      row = await env.DB.prepare("SELECT id,email FROM admins WHERE lower(email)=lower(?) LIMIT 1").bind(identifier).first();
    }
    if (row) {
      const token = await createResetToken(env, role, row.id);
      const delivery = await sendResetEmail(request, env, row.email, token);
      await audit(env, role, row.id, "request_password_reset", role, row.id, { delivered: delivery.sent });
    }
    return json({ message: "Se houver uma conta válida, o link de redefinição será enviado ao e-mail do titular." });
  }

  if (path === "/api/auth/reset-password" && method === "POST") {
    const data = await bodyJson(request);
    const newPassword = String(data.new_password || "");
    if (newPassword.length < 6) throw new HttpError(400, "A nova senha deve ter pelo menos 6 caracteres.");
    const digest = await sha256Hex(String(data.token || ""));
    const t = await env.DB.prepare(
      "SELECT * FROM reset_tokens WHERE token_hash=? AND used_at IS NULL LIMIT 1",
    ).bind(digest).first();
    if (!t || Date.parse(t.expires_at) < Date.now()) throw new HttpError(400, "Link de redefinição inválido ou expirado.");
    const hash = await hashPassword(newPassword);
    if (t.role === "student") await env.DB.prepare("UPDATE students SET password_hash=? WHERE id=?").bind(hash, t.user_id).run();
    else if (t.role === "admin") await env.DB.prepare("UPDATE admins SET password_hash=? WHERE id=?").bind(hash, t.user_id).run();
    else throw new HttpError(400, "Tipo de conta inválido.");
    await env.DB.prepare("UPDATE reset_tokens SET used_at=? WHERE id=?").bind(nowIso(), t.id).run();
    await audit(env, t.role, t.user_id, "complete_password_reset", t.role, t.user_id);
    return json({ message: "Senha redefinida com sucesso." });
  }

  const studentGetMatch = path.match(/^\/api\/students\/(\d+)$/);
  if (studentGetMatch && method === "GET") {
    const user = await currentUser(request, env);
    const id = Number(studentGetMatch[1]);
    if (user.role === "student" && user.id !== id) throw new HttpError(403, "Acesso negado.");
    if (user.role !== "student" && user.role !== "admin") throw new HttpError(403, "Acesso negado.");
    const s = await env.DB.prepare("SELECT * FROM students WHERE id=?").bind(id).first();
    if (!s) throw new HttpError(404, "Aluno não encontrado.");
    return json(studentRow(s));
  }

  if (path === "/api/student/profile" && method === "PATCH") {
    const user = await requireRole(request, env, "student");
    const data = await bodyJson(request);
    const allowed = ["name", "email", "phone"];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (data[key] !== undefined && data[key] !== null) {
        sets.push(`${key}=?`);
        vals.push(String(data[key]));
      }
    }
    if (sets.length) {
      vals.push(user.id);
      await env.DB.prepare(`UPDATE students SET ${sets.join(",")} WHERE id=?`).bind(...vals).run();
      await audit(env, "student", user.id, "update_own_profile", "student", user.id, allowed.filter((k) => data[k] != null));
    }
    const s = await env.DB.prepare("SELECT * FROM students WHERE id=?").bind(user.id).first();
    return json(studentRow(s));
  }

  if (path === "/api/student/change-password" && method === "POST") {
    const user = await requireRole(request, env, "student");
    const data = await bodyJson(request);
    const next = String(data.new_password || "");
    if (next.length < 6) throw new HttpError(400, "A nova senha deve ter pelo menos 6 caracteres.");
    const s = await env.DB.prepare("SELECT password_hash FROM students WHERE id=?").bind(user.id).first();
    if (!s || !(await verifyPassword(String(data.current_password || ""), s.password_hash))) throw new HttpError(400, "Senha atual incorreta.");
    await env.DB.prepare("UPDATE students SET password_hash=? WHERE id=?").bind(await hashPassword(next), user.id).run();
    await audit(env, "student", user.id, "change_own_password", "student", user.id);
    return json({ message: "Senha alterada pelo aluno." });
  }

  if (path === "/api/student/payments" && method === "GET") {
    const user = await requireRole(request, env, "student");
    await refreshPaymentStatuses(env);
    const rs = await env.DB.prepare("SELECT * FROM payments WHERE student_id=? ORDER BY due_date DESC").bind(user.id).all();
    return json((rs.results || []).map(paymentRow));
  }

  if (path === "/api/student/requests" && method === "GET") {
    const user = await requireRole(request, env, "student");
    const rs = await env.DB.prepare("SELECT * FROM student_requests WHERE student_id=? ORDER BY id DESC").bind(user.id).all();
    return json((rs.results || []).map((r) => ({
      id: `#REQ-${1000 + Number(r.id)}`,
      type: r.type,
      date: new Intl.DateTimeFormat("pt-BR", { timeZone: env.APP_TIMEZONE || "America/Cuiaba" }).format(new Date(r.created_at)),
      status: r.status,
    })));
  }

  if (path === "/api/student/requests" && method === "POST") {
    const user = await requireRole(request, env, "student");
    const data = await bodyJson(request);
    const type = String(data.type || "").trim();
    if (!type) throw new HttpError(400, "Informe o tipo de requerimento.");
    const ins = await env.DB.prepare(
      "INSERT INTO student_requests(student_id,type,text,status,created_at) VALUES(?,?,?,?,?)",
    ).bind(user.id, type, String(data.text || ""), "Em análise", nowIso()).run();
    const id = ins.meta.last_row_id;
    await audit(env, "student", user.id, "create_request", "request", id);
    return json({ id: `#REQ-${1000 + Number(id)}`, type, date: localDateTimeBR(env, nowIso()).slice(0, 10), status: "Em análise" });
  }

  if (path === "/api/admin/students" && method === "GET") {
    await requireRole(request, env, "admin");
    const rs = await env.DB.prepare("SELECT * FROM students ORDER BY name").all();
    return json((rs.results || []).map(studentRow));
  }

  if (path === "/api/admin/students" && method === "POST") {
    const user = await requireRole(request, env, "admin");
    const data = await bodyJson(request);
    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const registration = String(data.registration || "").trim();
    if (!name || !email || !registration) throw new HttpError(400, "Preencha nome, e-mail e matrícula.");
    try {
      const ins = await env.DB.prepare(
        `INSERT INTO students(name,email,cpf,phone,registration,course,period,campus,monthly_fee,access,password_hash,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,1,NULL,?)`,
      ).bind(
        name,
        email,
        data.cpf || null,
        data.phone || null,
        registration,
        data.course || null,
        data.period || "1º Módulo",
        data.campus || "Unidade Centro",
        Number(data.monthlyFee || 0),
        nowIso(),
      ).run();
      const sid = ins.meta.last_row_id;
      const token = await createResetToken(env, "student", sid);
      const delivery = await sendResetEmail(request, env, email, token, "ativação");
      await audit(env, "admin", user.id, "create_student", "student", sid, { activationSent: delivery.sent });
      const s = await env.DB.prepare("SELECT * FROM students WHERE id=?").bind(sid).first();
      return json({ ...studentRow(s), activationSent: delivery.sent });
    } catch (e) {
      if (String(e?.message || e).toLowerCase().includes("unique")) throw new HttpError(409, "E-mail, CPF ou matrícula já cadastrado.");
      throw e;
    }
  }

  const adminStudentMatch = path.match(/^\/api\/admin\/students\/(\d+)$/);
  if (adminStudentMatch && method === "PATCH") {
    const user = await requireRole(request, env, "admin");
    const sid = Number(adminStudentMatch[1]);
    const data = await bodyJson(request);
    const mapping = {
      name: "name",
      email: "email",
      phone: "phone",
      course: "course",
      period: "period",
      campus: "campus",
      monthlyFee: "monthly_fee",
    };
    const sets = [];
    const vals = [];
    const changed = [];
    for (const [key, column] of Object.entries(mapping)) {
      if (data[key] !== undefined && data[key] !== null) {
        sets.push(`${column}=?`);
        vals.push(key === "monthlyFee" ? Number(data[key]) : data[key]);
        changed.push(key);
      }
    }
    const exists = await env.DB.prepare("SELECT id FROM students WHERE id=?").bind(sid).first();
    if (!exists) throw new HttpError(404, "Aluno não encontrado.");
    if (sets.length) {
      vals.push(sid);
      await env.DB.prepare(`UPDATE students SET ${sets.join(",")} WHERE id=?`).bind(...vals).run();
      await audit(env, "admin", user.id, "update_student", "student", sid, changed);
    }
    const s = await env.DB.prepare("SELECT * FROM students WHERE id=?").bind(sid).first();
    return json(studentRow(s));
  }

  const accessMatch = path.match(/^\/api\/admin\/students\/(\d+)\/access$/);
  if (accessMatch && method === "POST") {
    const user = await requireRole(request, env, "admin");
    const sid = Number(accessMatch[1]);
    const data = await bodyJson(request);
    const exists = await env.DB.prepare("SELECT * FROM students WHERE id=?").bind(sid).first();
    if (!exists) throw new HttpError(404, "Aluno não encontrado.");
    const access = Boolean(data.access);
    await env.DB.prepare("UPDATE students SET access=? WHERE id=?").bind(access ? 1 : 0, sid).run();
    await audit(env, "admin", user.id, access ? "restore_access" : "suspend_access", "student", sid);
    const s = await env.DB.prepare("SELECT * FROM students WHERE id=?").bind(sid).first();
    return json(studentRow(s));
  }

  const resetMatch = path.match(/^\/api\/admin\/students\/(\d+)\/password-reset$/);
  if (resetMatch && method === "POST") {
    const user = await requireRole(request, env, "admin");
    const sid = Number(resetMatch[1]);
    const s = await env.DB.prepare("SELECT * FROM students WHERE id=?").bind(sid).first();
    if (!s) throw new HttpError(404, "Aluno não encontrado.");
    const token = await createResetToken(env, "student", sid);
    const delivery = await sendResetEmail(request, env, s.email, token);
    await audit(env, "admin", user.id, "send_password_reset", "student", sid, { delivered: delivery.sent });
    if (!delivery.sent) {
      return json({ message: "Solicitação registrada, mas o provedor de e-mail ainda não está configurado. O administrador não recebe nem define a senha." });
    }
    return json({ message: `Link de redefinição enviado diretamente para ${s.email}. O administrador não recebe nem define a senha.` });
  }

  if (path === "/api/admin/payments" && method === "GET") {
    await requireRole(request, env, "admin");
    await refreshPaymentStatuses(env);
    const rs = await env.DB.prepare("SELECT * FROM payments ORDER BY due_date DESC").all();
    return json((rs.results || []).map(paymentRow));
  }

  if (path === "/api/admin/payments" && method === "POST") {
    const user = await requireRole(request, env, "admin");
    const data = await bodyJson(request);
    const sid = Number(data.student_id);
    const due = String(data.due_date || "");
    const amount = Number(data.amount_due || 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new HttpError(400, "Data de vencimento inválida.");
    if (!(amount > 0)) throw new HttpError(400, "Valor da cobrança deve ser maior que zero.");
    const student = await env.DB.prepare("SELECT id FROM students WHERE id=?").bind(sid).first();
    if (!student) throw new HttpError(404, "Aluno não encontrado.");
    const id = `COB-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
    const status = due < localDateISO(env) ? "Atrasado" : "Pendente";
    await env.DB.prepare(
      `INSERT INTO payments(id,student_id,description,due_date,amount_due,amount_paid,status,created_at)
       VALUES(?,?,?,?,?,0,?,?)`,
    ).bind(id, sid, String(data.description || "Mensalidade"), due, amount, status, nowIso()).run();
    await audit(env, "admin", user.id, "create_charge", "payment", id, { student_id: sid, amount });
    const p = await env.DB.prepare("SELECT * FROM payments WHERE id=?").bind(id).first();
    return json(paymentRow(p));
  }

  const payMatch = path.match(/^\/api\/admin\/payments\/(.+)\/register$/);
  if (payMatch && method === "POST") {
    const user = await requireRole(request, env, "admin");
    const paymentId = decodeURIComponent(payMatch[1]);
    const data = await bodyJson(request);
    const amount = Number(data.amount || 0);
    if (!(amount > 0)) throw new HttpError(400, "Valor deve ser maior que zero.");
    const p = await env.DB.prepare("SELECT * FROM payments WHERE id=?").bind(paymentId).first();
    if (!p) throw new HttpError(404, "Cobrança não encontrada.");
    const newPaid = Math.min(Number(p.amount_due), Number(p.amount_paid) + amount);
    const paidAt = newPaid >= Number(p.amount_due) ? nowIso() : null;
    await env.DB.prepare("UPDATE payments SET amount_paid=?, paid_at=? WHERE id=?").bind(newPaid, paidAt, paymentId).run();
    await refreshPaymentStatuses(env, paymentId);
    await audit(env, "admin", user.id, "register_payment", "payment", paymentId, { amount });
    const updated = await env.DB.prepare("SELECT * FROM payments WHERE id=?").bind(paymentId).first();
    return json(paymentRow(updated));
  }

  if (path === "/api/admin/notification-settings" && method === "GET") {
    await requireRole(request, env, "admin");
    const s = await env.DB.prepare("SELECT * FROM notification_settings WHERE id=1").first();
    return json({
      email: Boolean(s.email_enabled),
      sms: Boolean(s.sms_enabled),
      whatsapp: Boolean(s.whatsapp_enabled),
      staffEmail: s.staff_email || "",
      staffPhone: s.staff_phone || "",
      daysAfterDue: Number(s.days_after_due || 1),
      repeatDays: Number(s.repeat_days || 3),
      dryRun: Boolean(s.dry_run),
    });
  }

  if (path === "/api/admin/notification-settings" && method === "PUT") {
    const user = await requireRole(request, env, "admin");
    const data = await bodyJson(request);
    await env.DB.prepare(
      `UPDATE notification_settings SET
       email_enabled=?,sms_enabled=?,whatsapp_enabled=?,staff_email=?,staff_phone=?,
       days_after_due=?,repeat_days=?,dry_run=?,updated_at=? WHERE id=1`,
    ).bind(
      data.email ? 1 : 0,
      data.sms ? 1 : 0,
      data.whatsapp ? 1 : 0,
      String(data.staffEmail || ""),
      String(data.staffPhone || ""),
      Math.max(0, Number(data.daysAfterDue || 0)),
      Math.max(1, Number(data.repeatDays || 3)),
      data.dryRun ? 1 : 0,
      nowIso(),
    ).run();
    await audit(env, "admin", user.id, "update_notification_settings", "notification_settings", 1);
    return json({
      email: Boolean(data.email), sms: Boolean(data.sms), whatsapp: Boolean(data.whatsapp),
      staffEmail: String(data.staffEmail || ""), staffPhone: String(data.staffPhone || ""),
      daysAfterDue: Math.max(0, Number(data.daysAfterDue || 0)),
      repeatDays: Math.max(1, Number(data.repeatDays || 3)), dryRun: Boolean(data.dryRun),
    });
  }

  if (path === "/api/admin/notification-logs" && method === "GET") {
    await requireRole(request, env, "admin");
    const rs = await env.DB.prepare(
      `SELECT l.*, s.name AS student_name
         FROM notification_logs l
         JOIN students s ON s.id=l.student_id
        ORDER BY l.id DESC LIMIT 50`,
    ).all();
    return json((rs.results || []).map((r) => ({
      date: localDateTimeBR(env, r.created_at),
      channel: r.channel,
      student: r.student_name,
      status: r.status,
    })));
  }

  if (path === "/api/admin/notifications/check-overdue" && method === "POST") {
    const user = await requireRole(request, env, "admin");
    const result = await processOverdueNotifications(env, false);
    await audit(env, "admin", user.id, "manual_overdue_check", "notifications", null, result);
    return json(result);
  }

  if (path === "/api/admin/audit" && method === "GET") {
    await requireRole(request, env, "admin");
    const rs = await env.DB.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 100").all();
    return json(rs.results || []);
  }

  throw new HttpError(404, "Rota de API não encontrada.");
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await routeApi(request, env);
      return env.ASSETS.fetch(request);
    } catch (e) {
      if (e instanceof HttpError) return error(e.message, e.status);
      console.error(e);
      return error("Erro interno do Meu Inova.", 500);
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      ensureSchema(env)
        .then(() => processOverdueNotifications(env, false))
        .catch((e) => console.error("overdue-cron", e)),
    );
  },
};
