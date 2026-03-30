const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'shifttrack.db');

// Asegurar que el directorio existe
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);

// WAL mode y claves foráneas
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Crear tablas si no existen
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'employee')),
    phone TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clock_records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES users(id),
    schedule_id TEXT REFERENCES schedules(id),
    clock_in DATETIME,
    clock_out DATETIME,
    hours_worked REAL,
    lat REAL,
    lng REAL,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS alert_config (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL REFERENCES users(id),
    tolerance_minutes INTEGER NOT NULL DEFAULT 15,
    email_active INTEGER NOT NULL DEFAULT 1
  );

  -- Catálogo de tareas: plantillas reutilizables sin empleado asignado
  CREATE TABLE IF NOT EXISTS task_catalog (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'media' CHECK(priority IN ('alta','media','baja')),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Asignaciones: vincula una tarea del catálogo a un empleado con recurrencia
  CREATE TABLE IF NOT EXISTS task_assignments (
    id TEXT PRIMARY KEY,
    catalog_id TEXT NOT NULL REFERENCES task_catalog(id),
    employee_id TEXT NOT NULL REFERENCES users(id),
    recurrence_type TEXT NOT NULL CHECK(recurrence_type IN ('única','diaria','semanal')),
    recurrence_days TEXT,
    start_date TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_task_assignments_emp ON task_assignments(employee_id);

  -- Instancias diarias generadas automáticamente
  CREATE TABLE IF NOT EXISTS task_instances (
    id TEXT PRIMARY KEY,
    assignment_id TEXT REFERENCES task_assignments(id),
    catalog_id TEXT REFERENCES task_catalog(id),
    employee_id TEXT NOT NULL REFERENCES users(id),
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','completada','vencida')),
    completed_at DATETIME,
    note TEXT,
    photo_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_task_instances_emp_date ON task_instances(employee_id, due_date);
  CREATE INDEX IF NOT EXISTS idx_task_instances_due_date ON task_instances(due_date);

  CREATE TABLE IF NOT EXISTS task_summary_log (
    id TEXT PRIMARY KEY,
    summary_date TEXT NOT NULL UNIQUE,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Migración: actualizar task_instances al nuevo esquema ──────────────────
// Si la tabla existe con el esquema viejo (task_id), recrearla con el nuevo.
{
  const cols = db.prepare("PRAGMA table_info(task_instances)").all().map(c => c.name);
  const needsMigration = !cols.includes('assignment_id') || !cols.includes('catalog_id');

  if (needsMigration) {
    db.exec(`
      DROP TABLE IF EXISTS task_instances;
      CREATE TABLE task_instances (
        id TEXT PRIMARY KEY,
        assignment_id TEXT REFERENCES task_assignments(id),
        catalog_id TEXT REFERENCES task_catalog(id),
        employee_id TEXT NOT NULL REFERENCES users(id),
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','completada','vencida')),
        completed_at DATETIME,
        note TEXT,
        photo_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_task_instances_emp_date ON task_instances(employee_id, due_date);
      CREATE INDEX IF NOT EXISTS idx_task_instances_due_date ON task_instances(due_date);
    `);
    console.log('[DB] Migración: task_instances actualizada al nuevo esquema.');
  }
}

// ─── Módulo de Proveedores ────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id           TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    rep_name     TEXT NOT NULL,
    rep_phone    TEXT,
    product_type TEXT,
    active       INTEGER DEFAULT 1,
    created_by   TEXT NOT NULL REFERENCES users(id),
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS daily_sessions (
    id               TEXT PRIMARY KEY,
    session_date     TEXT NOT NULL UNIQUE,
    initial_balance  REAL NOT NULL,
    opened_by        TEXT NOT NULL REFERENCES users(id),
    opened_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at        DATETIME,
    expected_balance REAL,
    real_balance     REAL,
    cash_difference  REAL,
    closed_by        TEXT REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS purchase_tickets (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES daily_sessions(id),
    supplier_id   TEXT NOT NULL REFERENCES suppliers(id),
    employee_id   TEXT NOT NULL REFERENCES users(id),
    amount        REAL NOT NULL,
    note          TEXT,
    is_voided     INTEGER DEFAULT 0,
    void_reason   TEXT,
    voided_by     TEXT REFERENCES users(id),
    voided_at     DATETIME,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_purchase_tickets_supplier ON purchase_tickets(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_tickets_session  ON purchase_tickets(session_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_tickets_date     ON purchase_tickets(registered_at);

  CREATE TABLE IF NOT EXISTS supplier_shift_changes (
    id                   TEXT PRIMARY KEY,
    session_id           TEXT NOT NULL REFERENCES daily_sessions(id),
    outgoing_user        TEXT NOT NULL REFERENCES users(id),
    incoming_user        TEXT NOT NULL REFERENCES users(id),
    cash_at_change       REAL,
    expected_at_change   REAL,
    difference_at_change REAL,
    changed_at           DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_supplier_shift_changes_session ON supplier_shift_changes(session_id);

  CREATE TABLE IF NOT EXISTS ticket_alerts (
    id             TEXT PRIMARY KEY,
    ticket_id      TEXT NOT NULL REFERENCES purchase_tickets(id),
    supplier_id    TEXT NOT NULL REFERENCES suppliers(id),
    day_of_week    INTEGER NOT NULL,
    historical_avg REAL NOT NULL,
    ticket_amount  REAL NOT NULL,
    deviation_pct  REAL NOT NULL,
    email_sent     INTEGER DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Módulo de Cortes de Caja ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS cash_register_cuts (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES users(id),
    schedule_id TEXT NOT NULL REFERENCES schedules(id),
    register_name TEXT NOT NULL,
    total_sales REAL NOT NULL,
    card_payments REAL NOT NULL,
    declared_cash REAL NOT NULL,
    notes TEXT,
    expected_cash REAL NOT NULL,
    cash_difference REAL NOT NULL,
    is_anomaly INTEGER NOT NULL DEFAULT 0,
    deviation_pct REAL,
    submitted_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    UNIQUE(schedule_id)
  );

  CREATE TABLE IF NOT EXISTS cut_baselines (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES users(id),
    register_name TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
    avg_total_sales REAL NOT NULL DEFAULT 0,
    sample_count INTEGER NOT NULL DEFAULT 0,
    last_updated TEXT DEFAULT (CURRENT_TIMESTAMP),
    UNIQUE(employee_id, register_name, day_of_week)
  );

  CREATE TABLE IF NOT EXISTS cut_alerts (
    id TEXT PRIMARY KEY,
    alert_type TEXT NOT NULL CHECK(alert_type IN ('missing_cut','anomaly_detected')),
    employee_id TEXT NOT NULL REFERENCES users(id),
    schedule_id TEXT NOT NULL REFERENCES schedules(id),
    cut_id TEXT REFERENCES cash_register_cuts(id),
    deviation_pct REAL,
    avg_reference REAL,
    sample_count INTEGER,
    is_seen INTEGER NOT NULL DEFAULT 0,
    seen_at TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );

  CREATE TABLE IF NOT EXISTS cut_alert_log (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL REFERENCES schedules(id),
    alert_type TEXT NOT NULL,
    sent_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    UNIQUE(schedule_id, alert_type)
  );

  CREATE TABLE IF NOT EXISTS cuts_config (
    id TEXT PRIMARY KEY,
    diff_yellow_threshold REAL NOT NULL DEFAULT 1.0,
    diff_red_threshold REAL NOT NULL DEFAULT 100.0,
    anomaly_threshold_pct REAL NOT NULL DEFAULT 30.0,
    min_samples_for_anomaly INTEGER NOT NULL DEFAULT 5,
    missing_cut_delay_min INTEGER NOT NULL DEFAULT 30,
    email_missing_cut INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );
`);

db.exec(`INSERT OR IGNORE INTO cuts_config (id) VALUES ('default')`);

// ─── Bloqueo de Caja 3 (solo un usuario a la vez) ──────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS caja_locks (
    caja       INTEGER PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    user_name  TEXT NOT NULL,
    locked_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
  );
`);

// ─── Saldo persistente de Caja 3 ───────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS caja3_balance (
    id         INTEGER PRIMARY KEY CHECK(id = 1),
    balance    REAL NOT NULL DEFAULT 0,
    updated_by TEXT REFERENCES users(id),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS caja3_balance_additions (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES daily_sessions(id),
    amount     REAL NOT NULL CHECK(amount > 0),
    added_by   TEXT NOT NULL REFERENCES users(id),
    added_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_caja3_additions_session ON caja3_balance_additions(session_id);

  CREATE TABLE IF NOT EXISTS caja3_shift_ends (
    id               TEXT PRIMARY KEY,
    session_id       TEXT NOT NULL REFERENCES daily_sessions(id),
    user_id          TEXT NOT NULL REFERENCES users(id),
    expected_balance REAL NOT NULL,
    declared_balance REAL NOT NULL,
    difference       REAL NOT NULL,
    ended_at         DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_caja3_shift_ends_session ON caja3_shift_ends(session_id);
`);

db.exec(`INSERT OR IGNORE INTO caja3_balance (id, balance) VALUES (1, 0)`);

// ─── Módulo de Faltantes de Producto ────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS product_shortages (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    note          TEXT,
    registered_by TEXT NOT NULL REFERENCES users(id),
    registered_at DATETIME NOT NULL
  );
`);

module.exports = db;
