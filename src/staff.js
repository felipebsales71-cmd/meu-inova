const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const PERMISSION_KEYS = [
  'dashboard.view',
  'students.view','students.manage',
  'finance.view','finance.manage',
  'academic.view','academic.manage',
  'exams.view','exams.manage',
  'faculty.view','faculty.manage',
  'reports.view',
  'notifications.manage',
  'communications.manage',
  'staff.view','staff.manage',
  'audit.view',
  'system.manage',
];

const PROFILES = {
  owner: {
    label: 'Proprietário',
    permissions: [...PERMISSION_KEYS],
  },
  management: {
    label: 'Gestão',
    permissions: [
      'dashboard.view','students.view','students.manage','finance.view','finance.manage',
      'academic.view','academic.manage','exams.view','exams.manage','faculty.view','faculty.manage',
      'reports.view','notifications.manage','communications.manage','staff.view','audit.view',
    ],
  },
  coordination: {
    label: 'Coordenação',
    permissions: [
      'dashboard.view','students.view','academic.view','academic.manage','exams.view','exams.manage',
      'faculty.view','faculty.manage','reports.view','communications.manage',
    ],
  },
  secretary: {
    label: 'Secretaria',
    permissions: [
      'dashboard.view','students.view','students.manage','finance.view','academic.view',
      'faculty.view','reports.view','communications.manage',
    ],
  },
  finance: {
    label: 'Financeiro',
    permissions: ['dashboard.view','students.view','finance.view','finance.manage','reports.view','notifications.manage'],
  },
  professor: {
    label: 'Professor',
    permissions: ['dashboard.view','academic.view','exams.view','exams.manage','faculty.view'],
  },
  custom: {
    label: 'Personalizado',
    permissions: ['dashboard.view'],
  },
};

const STAFF_SCHEMA = `
CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  role_label TEXT NOT NULL DEFAULT 'Gestão',
  profile_key TEXT NOT NULL DEFAULT 'custom',
  permissions_json TEXT,
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

function safeProfileKey(value) {
  const key = String(value || 'custom').toLowerCase();
  return PROFILES[key] ? key : 'custom';
}
function normalizedPermissions(value, profileKey = 'custom') {
  let list = value;
  if (!Array.isArray(list)) {
    try { list = JSON.parse(String(value || '[]')); } catch { list = []; }
  }
  if (!Array.isArray(list) || !list.length) list = PROFILES[safeProfileKey(profileKey)].permissions;
  return [...new Set(list.map(String).filter(x => PERMISSION_KEYS.includes(x)))];
}
function permissionsFromRow(row) {
  return normalizedPermissions(row?.permissions_json, row?.profile_key || 'custom');
}
function slugUsername(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 48);
}
async function uniqueUsername(env, preferred, name) {
  const base = slugUsername(preferred || name) || `usuario.${Date.now()}`;
  let candidate = base;
  let n = 2;
  while (await env.DB.prepare('SELECT id FROM staff_users WHERE lower(username)=lower(?) LIMIT 1').bind(candidate).first()) {
    candidate = `${base.slice(0, 42)}.${n++}`;
  }
  return candidate;
}

async function ensureStaffSchema(env) {
  if (!env.DB) throw new StaffError(500, 'Banco D1 não vinculado.');
  if (!staffSchemaReady) {
    staffSchemaReady = (async () => {
      for (const sql of STAFF_SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) await env.DB.prepare(sql).run();

      const cols = await env.DB.prepare('PRAGMA table_info(staff_users)').all();
      const names = new Set((cols.results || []).map(x => x.name));
      if (!names.has('profile_key')) await env.DB.prepare("ALTER TABLE staff_users ADD COLUMN profile_key TEXT NOT NULL DEFAULT 'custom'").run();
      if (!names.has('permissions_json')) await env.DB.prepare('ALTER TABLE staff_users ADD COLUMN permissions_json TEXT').run();

      const created = nowIso();
      const ownerPerms = JSON.stringify(PROFILES.owner.permissions);
      const managementPerms = JSON.stringify(PROFILES.management.permissions);
      await env.DB.prepare(`INSERT OR IGNORE INTO staff_users(name,username,role_label,profile_key,permissions_json,active,created_at) VALUES(?,?,?,?,?,?,?)`)
        .bind('Nilvan Santos', 'nilvan.santos', 'Proprietário', 'owner', ownerPerms, 1, created).run();
      await env.DB.prepare(`INSERT OR IGNORE INTO staff_users(name,username,role_label,profile_key,permissions_json,active,created_at) VALUES(?,?,?,?,?,?,?)`)
        .bind('Sophia Giovanna', 'sophia.giovanna', 'Gestão', 'management', managementPerms, 1, created).run();
      await env.DB.prepare(`UPDATE staff_users SET role_label='Proprietário',profile_key='owner',permissions_json=? WHERE username='nilvan.santos' AND (permissions_json IS NULL OR permissions_json='')`).bind(ownerPerms).run();
      await env.DB.prepare(`UPDATE staff_users SET role_label='Gestão',profile_key='management',permissions_json=? WHERE username='sophia.giovanna' AND (permissions_json IS NULL OR permissions_json='')`).bind(managementPerms).run();
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
    profileKey: staff.profile_key || 'custom',
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
    if (payload.staffId) {
      const row = await env.DB.prepare('SELECT * FROM staff_users WHERE id=? LIMIT 1').bind(Number(payload.staffId)).first();
      if (!row || !row.active) throw 0;
      payload.staffRow = row;
      payload.permissions = permissionsFromRow(row);
      payload.profileKey = row.profile_key || 'custom';
    } else {
      payload.permissions = [...PERMISSION_KEYS];
      payload.profileKey = 'owner';
    }
    return payload;
  } catch { throw new StaffError(401, 'Sessão administrativa inválida ou expirada.'); }
}

function hasPermission(actor, permission) {
  return !permission || (actor.permissions || []).includes(permission);
}
function requirePermission(actor, permission) {
  if (!hasPermission(actor, permission)) throw new StaffError(403, 'Seu perfil não possui permissão para esta operação.');
}
function isOwner(actor) {
  return actor.profileKey === 'owner' || !actor.staffId;
}

async function parseBody(request) {
  try { return await request.json(); } catch { throw new StaffError(400, 'Corpo JSON inválido.'); }
}

function staffView(row) {
  const profileKey = safeProfileKey(row.profile_key || 'custom');
  return {
    id: Number(row.id),
    name: row.name,
    username: row.username,
    email: row.email || '',
    roleLabel: row.role_label,
    profileKey,
    permissions: permissionsFromRow(row),
    active: Boolean(row.active),
    hasPassword: Boolean(row.password_hash),
    status: row.password_hash ? (row.active ? 'Ativo' : 'Suspenso') : (row.active ? 'Aguardando primeiro acesso' : 'Suspenso'),
  };
}

async function sendAccessEmail(env, staff, link, expiresAt) {
  if (!staff.email) throw new StaffError(400, 'Cadastre o e-mail deste usuário antes de enviar o acesso.');
  if (!env.RESEND_API_KEY) throw new StaffError(503, 'Provedor de e-mail não configurado.');
  const from = env.MAIL_FROM || 'Meu Inova <noreply@example.com>';
  const text = `Olá, ${staff.name}.\n\nSeu acesso ao Meu Inova foi criado.\n\nUsuário: ${staff.username}\nCrie sua senha neste link: ${link}\n\nO link expira em ${new Date(expiresAt).toLocaleString('pt-BR')}.\n\nSe você não esperava esta mensagem, ignore este e-mail.`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [staff.email], subject: 'Seu acesso ao Meu Inova', text }),
  });
  if (!response.ok) throw new StaffError(502, `E-mail recusado pelo provedor (${response.status}).`);
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
  const view = staffView(row);
  return json({
    token,
    user: {
      id: -100000 - Number(row.id),
      name: row.name,
      email: row.email || row.username,
      role: 'Administrador',
      staffRole: row.role_label,
      username: row.username,
      profileKey: view.profileKey,
      permissions: view.permissions,
    },
  });
}

export async function enforceStaffAccess(request, env) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  let actor;
  try { actor = await adminFromSession(request, env); } catch { return null; }
  if (!actor.staffId) return null;

  const path = new URL(request.url).pathname;
  const method = request.method.toUpperCase();
  const read = method === 'GET' || method === 'HEAD';
  let permission = null;
  let safeEmpty = null;

  if (path === '/api/admin/students' || /^\/api\/admin\/students\//.test(path)) {
    permission = read ? 'students.view' : 'students.manage';
    if (read && path === '/api/admin/students') safeEmpty = [];
  } else if (path === '/api/admin/payments' || /^\/api\/admin\/payments\//.test(path)) {
    permission = read ? 'finance.view' : 'finance.manage';
    if (read && path === '/api/admin/payments') safeEmpty = [];
  } else if (path.startsWith('/api/admin/notification-settings')) {
    permission = 'notifications.manage';
    if (read) safeEmpty = { email:false,sms:false,whatsapp:false,staffEmail:'',staffPhone:'',daysAfterDue:1,repeatDays:3,dryRun:true };
  } else if (path.startsWith('/api/admin/notification-logs')) {
    permission = 'notifications.manage';
    if (read) safeEmpty = [];
  } else if (path.startsWith('/api/admin/notifications/')) {
    permission = 'notifications.manage';
  } else if (path.startsWith('/api/admin/audit')) {
    permission = 'audit.view';
  } else if (path.startsWith('/api/faculty/')) {
    permission = read ? 'faculty.view' : 'faculty.manage';
    if (read && path === '/api/faculty/professors') safeEmpty = [];
  } else if (path.startsWith('/api/academic/admin/exams') || /\/exams(?:\/|$)/.test(path)) {
    permission = read ? 'exams.view' : 'exams.manage';
    if (read && (path === '/api/academic/admin/exams')) safeEmpty = [];
  } else if (path.startsWith('/api/academic/admin/')) {
    permission = read ? 'academic.view' : 'academic.manage';
    if (read && path === '/api/academic/admin/summary') safeEmpty = { courses:0,disciplines:0,lessons:0,enrollments:0,publishedExams:0 };
    if (read && (path === '/api/academic/admin/courses' || path === '/api/academic/admin/disciplines')) safeEmpty = [];
  }

  if (!permission || hasPermission(actor, permission)) return null;
  if (safeEmpty !== null) return json(safeEmpty, 200);
  return json({ detail: 'Seu perfil não possui permissão para acessar este recurso.' }, 403);
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

    const actor = await adminFromSession(request, env);

    if (path === '/api/staff/profiles' && method === 'GET') {
      requirePermission(actor, 'staff.view');
      return json(Object.entries(PROFILES).map(([key, p]) => ({ key, label:p.label, permissions:p.permissions })));
    }

    if (path === '/api/staff' && method === 'GET') {
      if (!hasPermission(actor, 'staff.view')) return json([]);
      const r = await env.DB.prepare("SELECT * FROM staff_users ORDER BY CASE profile_key WHEN 'owner' THEN 0 ELSE 1 END,name").all();
      return json((r.results || []).map(staffView));
    }

    if (path === '/api/staff' && method === 'POST') {
      requirePermission(actor, 'staff.manage');
      const data = await parseBody(request);
      const name = String(data.name || '').trim();
      if (!name) throw new StaffError(400, 'Informe o nome do usuário.');
      const profileKey = safeProfileKey(data.profileKey || 'custom');
      if (profileKey === 'owner' && !isOwner(actor)) throw new StaffError(403, 'Somente o proprietário pode criar outro proprietário.');
      const username = await uniqueUsername(env, data.username, name);
      const emailRaw = String(data.email || '').trim().toLowerCase();
      const email = emailRaw || null;
      const roleLabel = String(data.roleLabel || PROFILES[profileKey].label).trim() || PROFILES[profileKey].label;
      const permissions = normalizedPermissions(data.permissions, profileKey);
      const result = await env.DB.prepare(`INSERT INTO staff_users(name,username,email,role_label,profile_key,permissions_json,active,created_at) VALUES(?,?,?,?,?,?,?,?)`)
        .bind(name, username, email, roleLabel, profileKey, JSON.stringify(permissions), data.active === false ? 0 : 1, nowIso()).run();
      const row = await env.DB.prepare('SELECT * FROM staff_users WHERE id=?').bind(Number(result.meta.last_row_id)).first();
      return json(staffView(row), 201);
    }

    const match = path.match(/^\/api\/staff\/(\d+)$/);
    if (match && method === 'PATCH') {
      requirePermission(actor, 'staff.manage');
      const id = Number(match[1]);
      const data = await parseBody(request);
      const row = await env.DB.prepare('SELECT * FROM staff_users WHERE id=?').bind(id).first();
      if (!row) throw new StaffError(404, 'Usuário da equipe não encontrado.');
      if ((row.profile_key === 'owner' || data.profileKey === 'owner') && !isOwner(actor)) throw new StaffError(403, 'Somente o proprietário pode alterar um perfil de proprietário.');
      const profileKey = safeProfileKey(data.profileKey ?? row.profile_key ?? 'custom');
      const name = String(data.name ?? row.name).trim();
      const emailRaw = String(data.email ?? row.email ?? '').trim().toLowerCase();
      const email = emailRaw || null;
      const roleLabel = String(data.roleLabel ?? row.role_label ?? PROFILES[profileKey].label).trim() || PROFILES[profileKey].label;
      const active = data.active === undefined ? Boolean(row.active) : Boolean(data.active);
      const permissions = data.permissions === undefined ? permissionsFromRow(row) : normalizedPermissions(data.permissions, profileKey);
      await env.DB.prepare('UPDATE staff_users SET name=?,email=?,role_label=?,profile_key=?,permissions_json=?,active=?,updated_at=? WHERE id=?')
        .bind(name, email, roleLabel, profileKey, JSON.stringify(permissions), active ? 1 : 0, nowIso(), id).run();
      return json(staffView(await env.DB.prepare('SELECT * FROM staff_users WHERE id=?').bind(id).first()));
    }

    const linkMatch = path.match(/^\/api\/staff\/(\d+)\/access-link$/);
    if (linkMatch && method === 'POST') {
      requirePermission(actor, 'staff.manage');
      const id = Number(linkMatch[1]);
      const data = await parseBody(request).catch(() => ({}));
      const staff = await env.DB.prepare('SELECT * FROM staff_users WHERE id=?').bind(id).first();
      if (!staff) throw new StaffError(404, 'Usuário da equipe não encontrado.');
      if (staff.profile_key === 'owner' && !isOwner(actor)) throw new StaffError(403, 'Somente o proprietário pode gerar acesso para outro proprietário.');
      if (!staff.active) throw new StaffError(400, 'Ative o usuário antes de gerar um link.');
      const raw = b64urlBytes(crypto.getRandomValues(new Uint8Array(32)));
      const digest = await sha256Hex(raw);
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      await env.DB.prepare('DELETE FROM staff_access_tokens WHERE staff_id=? AND used_at IS NULL').bind(id).run();
      await env.DB.prepare('INSERT INTO staff_access_tokens(staff_id,token_hash,expires_at,created_at) VALUES(?,?,?,?)')
        .bind(id, digest, expiresAt, nowIso()).run();
      const link = `${url.origin}/equipe-acesso.html?token=${encodeURIComponent(raw)}`;
      let emailSent = false;
      if (data.sendEmail) {
        await sendAccessEmail(env, staff, link, expiresAt);
        emailSent = true;
      }
      return json({ link, expiresAt, username: staff.username, name: staff.name, email: staff.email || '', emailSent });
    }

    throw new StaffError(404, 'Rota de equipe não encontrada.');
  } catch (e) {
    if (e instanceof StaffError) return json({ detail: e.message }, e.status);
    const message = String(e?.message || e || '');
    if (/UNIQUE constraint failed/i.test(message)) return json({ detail: 'Já existe um usuário com este e-mail ou nome de usuário.' }, 409);
    console.error('staff-module', e);
    return json({ detail: 'Erro interno no módulo de equipe.' }, 500);
  }
}
