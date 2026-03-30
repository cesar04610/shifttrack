const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const auth = require('../middleware/auth');
const { getLocalToday, getLocalISOString } = require('../utils/dateUtils');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTotalSpent(sessionId) {
  return db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM purchase_tickets WHERE session_id = ? AND is_voided = 0'
  ).get(sessionId).total;
}

function getTotalAdditions(sessionId) {
  return db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM caja3_balance_additions WHERE session_id = ?'
  ).get(sessionId).total;
}

function computeBalance(session) {
  const total_spent = getTotalSpent(session.id);
  const total_additions = getTotalAdditions(session.id);
  const current_balance = session.initial_balance + total_additions - total_spent;
  return { total_spent, total_additions, current_balance };
}

// GET /api/sessions/today — sesión activa del día (cualquier rol puede consultarla)
router.get('/today', auth, (req, res) => {
  const today = getLocalToday();

  const session = db.prepare(`
    SELECT s.*, u.name AS opened_by_name
    FROM daily_sessions s
    LEFT JOIN users u ON s.opened_by = u.id
    WHERE s.session_date = ?
  `).get(today);

  if (!session) return res.json({ exists: false });

  const { total_spent, total_additions, current_balance } = computeBalance(session);
  res.json({ exists: true, session: { ...session, total_spent, total_additions, current_balance } });
});

// POST /api/sessions/auto — creación idempotente de sesión del día
router.post('/auto', auth, (req, res) => {
  const today = getLocalToday();

  let session = db.prepare('SELECT * FROM daily_sessions WHERE session_date = ?').get(today);

  if (!session) {
    // Leer saldo persistente de caja 3
    const persistent = db.prepare('SELECT balance FROM caja3_balance WHERE id = 1').get();
    const initialBalance = persistent ? persistent.balance : 0;

    const id = uuidv4();
    db.prepare(`
      INSERT INTO daily_sessions (id, session_date, initial_balance, opened_by, opened_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, today, initialBalance, req.user.id, getLocalISOString());

    session = db.prepare('SELECT * FROM daily_sessions WHERE id = ?').get(id);
  }

  const { total_spent, total_additions, current_balance } = computeBalance(session);
  res.json({ ...session, total_spent, total_additions, current_balance });
});

// POST /api/sessions — abrir nueva sesión del día (legacy, mantener compatibilidad)
router.post('/', auth, (req, res) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ error: 'Solo los empleados pueden abrir sesiones' });
  }

  const today = getLocalToday();
  const existing = db.prepare('SELECT id FROM daily_sessions WHERE session_date = ?').get(today);
  if (existing) {
    return res.status(409).json({ error: 'Ya existe una sesión para hoy' });
  }

  const { initial_balance } = req.body;
  if (initial_balance === undefined || initial_balance === null || parseFloat(initial_balance) < 0) {
    return res.status(400).json({ error: 'El saldo inicial es requerido y debe ser mayor o igual a 0' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO daily_sessions (id, session_date, initial_balance, opened_by, opened_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, today, parseFloat(initial_balance), req.user.id, getLocalISOString());

  const session = db.prepare('SELECT * FROM daily_sessions WHERE id = ?').get(id);
  res.status(201).json({ ...session, total_spent: 0, total_additions: 0, current_balance: session.initial_balance });
});

// GET /api/sessions/current-balance — balance actual para modal de cierre de turno
router.get('/current-balance', auth, (req, res) => {
  const today = getLocalToday();
  const session = db.prepare('SELECT * FROM daily_sessions WHERE session_date = ?').get(today);

  if (!session) {
    const persistent = db.prepare('SELECT balance FROM caja3_balance WHERE id = 1').get();
    return res.json({ expected_balance: persistent ? persistent.balance : 0 });
  }

  const { total_spent, total_additions, current_balance } = computeBalance(session);
  res.json({
    session_id: session.id,
    initial_balance: session.initial_balance,
    total_additions,
    total_spent,
    expected_balance: current_balance,
  });
});

// POST /api/sessions/shift-end — cierre de turno (llamado al logout de caja 3)
router.post('/shift-end', auth, (req, res) => {
  const { real_balance } = req.body;
  if (real_balance === undefined || real_balance === null) {
    return res.status(400).json({ error: 'El saldo real declarado es requerido' });
  }

  const today = getLocalToday();
  const session = db.prepare('SELECT * FROM daily_sessions WHERE session_date = ?').get(today);

  if (!session) {
    return res.status(404).json({ error: 'No hay sesión activa para hoy' });
  }

  const { current_balance: expected_balance } = computeBalance(session);
  const difference = parseFloat(real_balance) - expected_balance;

  // Registrar cierre de turno
  const id = uuidv4();
  const now = getLocalISOString();
  db.prepare(`
    INSERT INTO caja3_shift_ends (id, session_id, user_id, expected_balance, declared_balance, difference, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, session.id, req.user.id, expected_balance, parseFloat(real_balance), difference, now);

  // Actualizar saldo persistente de caja 3
  db.prepare(`
    UPDATE caja3_balance SET balance = ?, updated_by = ?, updated_at = ? WHERE id = 1
  `).run(parseFloat(real_balance), req.user.id, now);

  // Liberar lock de caja 3
  if (req.user.caja === 3) {
    db.prepare('DELETE FROM caja_locks WHERE caja = 3 AND user_id = ?').run(req.user.id);
  }

  const shiftEnd = db.prepare(`
    SELECT se.*, u.name AS user_name
    FROM caja3_shift_ends se
    JOIN users u ON se.user_id = u.id
    WHERE se.id = ?
  `).get(id);

  res.json(shiftEnd);
});

// POST /api/sessions/add-balance — agregar saldo a caja 3
router.post('/add-balance', auth, (req, res) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ error: 'Solo los empleados pueden agregar saldo' });
  }

  const { amount } = req.body;
  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  }

  const today = getLocalToday();
  let session = db.prepare('SELECT * FROM daily_sessions WHERE session_date = ?').get(today);

  if (!session) {
    return res.status(400).json({ error: 'No hay sesión activa para hoy' });
  }

  const id = uuidv4();
  const now = getLocalISOString();
  db.prepare(`
    INSERT INTO caja3_balance_additions (id, session_id, amount, added_by, added_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, session.id, parseFloat(amount), req.user.id, now);

  // Actualizar saldo persistente
  db.prepare(`
    UPDATE caja3_balance SET balance = balance + ?, updated_by = ?, updated_at = ? WHERE id = 1
  `).run(parseFloat(amount), req.user.id, now);

  const { total_spent, total_additions, current_balance } = computeBalance(session);
  res.json({ current_balance, total_additions });
});

// POST /api/sessions/close — cerrar sesión del día con cuadre final
router.post('/close', auth, (req, res) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ error: 'Solo los empleados pueden cerrar sesiones' });
  }

  const today = getLocalToday();
  const session = db.prepare('SELECT * FROM daily_sessions WHERE session_date = ?').get(today);
  if (!session) return res.status(404).json({ error: 'No hay sesión activa para hoy' });
  if (session.closed_at) return res.status(409).json({ error: 'La sesión del día ya fue cerrada' });

  const { real_balance } = req.body;
  if (real_balance === undefined || real_balance === null) {
    return res.status(400).json({ error: 'El saldo real declarado es requerido' });
  }

  const { current_balance: expected_balance } = computeBalance(session);
  const cash_difference = parseFloat(real_balance) - expected_balance;

  db.prepare(`
    UPDATE daily_sessions SET
      closed_at        = ?,
      expected_balance = ?,
      real_balance     = ?,
      cash_difference  = ?,
      closed_by        = ?
    WHERE id = ?
  `).run(getLocalISOString(), expected_balance, parseFloat(real_balance), cash_difference, req.user.id, session.id);

  res.json(db.prepare('SELECT * FROM daily_sessions WHERE id = ?').get(session.id));
});

module.exports = router;
