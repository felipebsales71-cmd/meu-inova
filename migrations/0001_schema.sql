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
