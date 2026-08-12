const encoder = new TextEncoder();
const decoder = new TextDecoder();

const STAFF_SCHEMA = `
CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  role_label TEXT NOT NULL DEFAULT 'Gestão',
  password_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS staff_access_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_access_token_hash ON staff_access_tokens(token_hash);
`;

let staffSchemaReady = null;
const nowIso = () => new Date().toISOString();
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
class StaffError extends Error { constructor(status, message) { super(message); this.status = status; } }

function b64urlBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function bytesFromB64url(value) {
  const base = String(value).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(value).length % 4)) % 4);
  const bin = atob(base);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
async function sha256Hex(text) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(text))));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}
async function hashPassword(password) {
  const iterations = 25000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256);
  return `pbkdf2_sha256$${iterations}$${b64urlBytes(salt)}$${b64urlBytes(new Uint8Array(bits))}`;
}
async function verifyPassword(password, encodedHash) {
  if (!encodedHash) return false;
  try {
    const [algo, rounds, salt64, expected64] = String(encodedHash).split('$');
    if (algo !== 'pbkdf2_sha256') return false;
    const salt = bytesFromB64url(salt64);
    const expected = bytesFromB64url(expected64);
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: Number(rounds), hash: 'SHA-256' }, keyMaterial, 256);
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch { return false; }
}

async function ensureStaffSchema(env) {
  if (!env.DB) throw new StaffError(500, 'Banco D1 não vinculado.');
  if (!staffSchemaReady) {
    staffSchemaReady = (async () => {
      for (const sql of STAFF_SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) await env.DB.prepare(sql).run();
      const created = nowIso();
      await env.DB.prepare(`INSERT OR IGNORE INTO staff_users(name,username,role_label,active,created_at) VALUES(?,?,?,?,?)`)
        .bind('Nilvan Santos', 'nilvan.santos', 'Proprietário', 1, created).run();
      await env.DB.prepare(`INSERT OR IGNORE INTO staff_users(name,username,role_label,active,created_at) VALUES(?,?,?,?,?)`)
        .bind('Sophia Giovanna', 'sophia.giovanna', 'Gestão', 1, created).run();
      return true;
    })().catch(e => { staffSchemaReady = null; throw e; });
  }
  return staffSchemaReady;
}

async function makeSessionToken(env, staff) {
  if (!env.SESSION_SECRET) throw new StaffError(500, 'SESSION_SECRET não configurado.');
  const hours = Math.max(1, Number(env.SESSION_HOURS || 12));
  const payload = {
    role: 'admin',
    id: -100000 - Number(staff.id),
    staffId: Number(staff.id),
    staffRole: staff.role_label,
    exp: Math.floor(Date.now() / 1000) + hours * 3600,
  };
  const body = b64urlBytes(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return `${body}.${b64urlBytes(sig)}`;
}

async function adminFromSession(request, env) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new StaffError(401, 'Autenticação administrativa necessária.');
  try {
    const [body, sig] = auth.slice(7).split('.');
    if (!body || !sig || !env.SESSION_SECRET) throw 0;
    const key = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, bytesFromB64url(sig), encoder.encode(body));
    if (!ok) throw 0;
    const payload = JSON.parse(decoder.decode(bytesFromB64url(body)));
    if (payload.role !== 'admin' || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw 0;
    return payload;
  } catch { throw new StaffError(401, 'Sessão administrativa inválida ou expirada.'); }
}

async function parseBody(request) {
  try { return await request.json(); } catch { throw new StaffError(400, 'Corpo JSON inválido.'); }
}

function staffView(row) {
  return {
    id: Number(row.id),
    name: row.name,
    username: row.username,
    email: row.email || '',
    roleLabel: row.role_label,
    active: Boolean(row.active),
    hasPassword: Boolean(row.password_hash),
    status: row.password_hash ? (row.active ? 'Ativo' : 'Suspenso') : 'Aguardando primeiro acesso',
  };
}

export async function tryStaffLogin(request, env) {
  await ensureStaffSchema(env);
  const data = await parseBody(request.clone());
  const identifier = String(data.identifier || '').trim().toLowerCase();
  if (!identifier) return null;
  const row = await env.DB.prepare(`SELECT * FROM staff_users WHERE lower(username)=? OR lower(COALESCE(email,''))=? LIMIT 1`)
    .bind(identifier, identifier).first();
  if (!row) return null;
  if (!row.active) throw new StaffError(403, 'Este acesso da equipe está suspenso.');
  if (!row.password_hash) throw new StaffError(403, 'Primeiro acesso ainda não concluído. Solicite o link de ativação ao administrador.');
  if (!(await verifyPassword(String(data.password || ''), row.password_hash))) throw new StaffError(401, 'Credenciais administrativas inválidas.');
  const token = await makeSessionToken(env, row);
  return json({
    token,
    user: { id: -100000 - Number(row.id), name: row.name, email: row.email || row.username, role: 'Administrador', staffRole: row.role_label, username: row.username },
  });
}

export async function handleStaff(request, env) {
  try {
    await ensureStaffSchema(env);
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path === '/api/staff/activate' && method === 'POST') {
      const data = await parseBody(request);
      const token = String(data.token || '');
      const password = String(data.password || '');
      if (password.length < 10) throw new StaffError(400, 'A senha deve ter pelo menos 10 caracteres.');
      const digest = await sha256Hex(token);
      const access = await env.DB.prepare(`SELECT t.*,s.name,s.username,s.active FROM staff_access_tokens t JOIN staff_users s ON s.id=t.staff_id WHERE t.token_hash=? AND t.used_at IS NULL LIMIT 1`)
        .bind(digest).first();
      if (!access || Date.parse(access.expires_at) < Date.now()) throw new StaffError(400, 'Link de primeiro acesso inválido ou expirado.');
      if (!access.active) throw new StaffError(403, 'Este acesso está suspenso.');
      const hash = await hashPassword(password);
      await env.DB.batch([
        env.DB.prepare('UPDATE staff_users SET password_hash=?,updated_at=? WHERE id=?').bind(hash, nowIso(), access.staff_id),
        env.DB.prepare('UPDATE staff_access_tokens SET used_at=? WHERE id=?').bind(nowIso(), access.id),
      ]);
      return json({ message: 'Acesso ativado com sucesso.', username: access.username, name: access.name });
    }

    await adminFromSession(request, env);

    if (path === '/api/staff' && method === 'GET') {
      const r = await env.DB.prepare('SELECT * FROM staff_users ORDER BY CASE role_label WHEN \'Proprietário\' THEN 0 ELSE 1 END,name').all();
      return json((r.results || []).map(staffView));
    }

    const match = path.match(/^\/api\/staff\/(\d+)$/);
    if (match && method === 'PATCH') {
      const id = Number(match[1]);
      const data = await parseBody(request);
      const row = await env.DB.prepare('SELECT * FROM staff_users WHERE id=?').bind(id).first();
      if (!row) throw new StaffError(404, 'Usuário da equipe não encontrado.');
      const name = String(data.name ?? row.name).trim();
      const emailRaw = String(data.email ?? row.email ?? '').trim().toLowerCase();
      const email = emailRaw || null;
      const roleLabel = String(data.roleLabel ?? row.role_label).trim() || 'Gestão';
      const active = data.active === undefined ? Boolean(row.active) : Boolean(data.active);
      await env.DB.prepare('UPDATE staff_users SET name=?,email=?,role_label=?,active=?,updated_at=? WHERE id=?')
        .bind(name, email, roleLabel, active ? 1 : 0, nowIso(), id).run();
      return json(staffView(await env.DB.prepare('SELECT * FROM staff_users WHERE id=?').bind(id).first()));
    }

    const linkMatch = path.match(/^\/api\/staff\/(\d+)\/access-link$/);
    if (linkMatch && method === 'POST') {
      const id = Number(linkMatch[1]);
      const staff = await env.DB.prepare('SELECT * FROM staff_users WHERE id=?').bind(id).first();
      if (!staff) throw new StaffError(404, 'Usuário da equipe não encontrado.');
      if (!staff.active) throw new StaffError(400, 'Ative o usuário antes de gerar um link.');
      const raw = b64urlBytes(crypto.getRandomValues(new Uint8Array(32)));
      const digest = await sha256Hex(raw);
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      await env.DB.prepare('DELETE FROM staff_access_tokens WHERE staff_id=? AND used_at IS NULL').bind(id).run();
      await env.DB.prepare('INSERT INTO staff_access_tokens(staff_id,token_hash,expires_at,created_at) VALUES(?,?,?,?)')
        .bind(id, digest, expiresAt, nowIso()).run();
      const link = `${url.origin}/equipe-acesso.html?token=${encodeURIComponent(raw)}`;
      return json({ link, expiresAt, username: staff.username, name: staff.name });
    }

    throw new StaffError(404, 'Rota de equipe não encontrada.');
  } catch (e) {
    if (e instanceof StaffError) return json({ detail: e.message }, e.status);
    console.error('staff-module', e);
    return json({ detail: 'Erro interno no módulo de equipe.' }, 500);
  }
}
