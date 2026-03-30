const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/role');
const ticketAlertService = require('../services/ticketAlertService');
const { getLocalToday, getLocalISOString } = require('../utils/dateUtils');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getActiveSession() {
  const today = getLocalToday();
  return db.prepare('SELECT * FROM daily_sessions WHERE session_date = ?').get(today);
}

function getCurrentBalance(sessionId, initialBalance) {
  const spent = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM purchase_tickets WHERE session_id = ? AND is_voided = 0'
  ).get(sessionId);
  const additions = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM caja3_balance_additions WHERE session_id = ?'
  ).get(sessionId);
  return initialBalance + additions.total - spent.total;
}

// ─── GET /api/tickets — tickets + separadores de turno de la sesión activa ───
router.get('/', auth, (req, res) => {
  const session = getActiveSession();
  if (!session) return res.json({ tickets: [], shiftChanges: [], session: null });

  const tickets = db.prepare(`
    SELECT pt.*, s.company_name AS supplier_name, u.name AS employee_name
    FROM purchase_tickets pt
    JOIN suppliers s ON pt.supplier_id = s.id
    JOIN users u ON pt.employee_id = u.id
    WHERE pt.session_id = ?
    ORDER BY pt.registered_at ASC
  `).all(session.id);

  const shiftChanges = db.prepare(`
    SELECT sc.*, u_out.name AS outgoing_name, u_in.name AS incoming_name
    FROM supplier_shift_changes sc
    JOIN users u_out ON sc.outgoing_user = u_out.id
    JOIN users u_in ON sc.incoming_user = u_in.id
    WHERE sc.session_id = ?
    ORDER BY sc.changed_at ASC
  `).all(session.id);

  const balanceAdditions = db.prepare(`
    SELECT ba.*, u.name AS added_by_name
    FROM caja3_balance_additions ba
    JOIN users u ON ba.added_by = u.id
    WHERE ba.session_id = ?
    ORDER BY ba.added_at ASC
  `).all(session.id);

  const shiftEnds = db.prepare(`
    SELECT se.*, u.name AS user_name
    FROM caja3_shift_ends se
    JOIN users u ON se.user_id = u.id
    WHERE se.session_id = ?
    ORDER BY se.ended_at ASC
  `).all(session.id);

  const total_additions = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM caja3_balance_additions WHERE session_id = ?'
  ).get(session.id).total;

  const total_spent = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM purchase_tickets WHERE session_id = ? AND is_voided = 0'
  ).get(session.id).total;

  const current_balance = getCurrentBalance(session.id, session.initial_balance);
  res.json({ tickets, shiftChanges, balanceAdditions, shiftEnds, session: { ...session, current_balance, total_additions, total_spent } });
});

// ─── GET /api/tickets/check — previsualizar alerta antes de confirmar ─────────
// Devuelve info de alerta sin registrar el ticket.
router.get('/check', auth, (req, res) => {
  const { supplier_id, amount } = req.query;
  if (!supplier_id || !amount) return res.json({ should_warn: false });

  const ticketAmount = parseFloat(amount);
  if (isNaN(ticketAmount) || ticketAmount <= 0) return res.json({ should_warn: false });

  const now = new Date();
  const jsDay = now.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;

  const avgRow = db.prepare(`
    SELECT AVG(pt.amount) AS historical_avg, COUNT(*) AS ticket_count
    FROM purchase_tickets pt
    WHERE pt.supplier_id = ?
      AND CASE WHEN strftime('%w', pt.registered_at) = '0' THEN 7
               ELSE CAST(strftime('%w', pt.registered_at) AS INTEGER) END = ?
      AND pt.is_voided = 0
  `).get(supplier_id, isoDay);

  if (!avgRow || avgRow.ticket_count < 3 || !avgRow.historical_avg) {
    return res.json({ should_warn: false });
  }

  const deviation_pct = ((ticketAmount - avgRow.historical_avg) / avgRow.historical_avg) * 100;
  if (deviation_pct <= 20) return res.json({ should_warn: false });

  const DAY_NAMES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  res.json({
    should_warn: true,
    historical_avg: parseFloat(avgRow.historical_avg.toFixed(2)),
    deviation_pct: parseFloat(deviation_pct.toFixed(1)),
    day_name: DAY_NAMES[isoDay],
  });
});

// ─── POST /api/tickets — registrar un nuevo ticket de compra ──────────────────
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ error: 'Solo los empleados pueden registrar tickets' });
  }

  const session = getActiveSession();
  if (!session) {
    return res.status(400).json({ error: 'No hay sesión activa para hoy.' });
  }

  const { supplier_id, amount, note } = req.body;
  if (!supplier_id || !amount) {
    return res.status(400).json({ error: 'Proveedor y monto son requeridos' });
  }
  if (parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  }

  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplier_id);
  if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO purchase_tickets (id, session_id, supplier_id, employee_id, amount, note, registered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, session.id, supplier_id, req.user.id, parseFloat(amount), note?.trim() || null, getLocalISOString());

  const ticket = db.prepare(`
    SELECT pt.*, s.company_name AS supplier_name, u.name AS employee_name
    FROM purchase_tickets pt
    JOIN suppliers s ON pt.supplier_id = s.id
    JOIN users u ON pt.employee_id = u.id
    WHERE pt.id = ?
  `).get(id);

  const current_balance = getCurrentBalance(session.id, session.initial_balance);

  // Verificar alerta en segundo plano (no bloquea la respuesta con try/catch)
  let alert = null;
  try {
    alert = await ticketAlertService.checkTicketAlert(supplier_id, id, parseFloat(amount));
  } catch (err) {
    console.error('[TICKET] Error en checkTicketAlert:', err.message);
  }

  res.status(201).json({ ticket, current_balance, alert });
});

// ─── POST /api/tickets/:id/void — anular ticket (máx. 5 minutos) ─────────────
router.post('/:id/void', auth, (req, res) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ error: 'Solo los empleados pueden anular tickets' });
  }

  const ticket = db.prepare('SELECT * FROM purchase_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (ticket.is_voided) return res.status(409).json({ error: 'El ticket ya fue anulado' });
  if (ticket.employee_id !== req.user.id) {
    return res.status(403).json({ error: 'Solo puedes anular tus propios tickets' });
  }

  const registeredAt = new Date(ticket.registered_at).getTime();
  if (Date.now() - registeredAt > 5 * 60 * 1000) {
    return res.status(409).json({ error: 'Solo puedes anular tickets dentro de los primeros 5 minutos' });
  }

  const { void_reason } = req.body;
  if (!void_reason?.trim()) {
    return res.status(400).json({ error: 'La razón de anulación es requerida' });
  }

  db.prepare(`
    UPDATE purchase_tickets SET
      is_voided   = 1,
      void_reason = ?,
      voided_by   = ?,
      voided_at   = ?
    WHERE id = ?
  `).run(void_reason.trim(), req.user.id, getLocalISOString(), req.params.id);

  const session = db.prepare('SELECT * FROM daily_sessions WHERE id = ?').get(ticket.session_id);
  const current_balance = getCurrentBalance(session.id, session.initial_balance);

  res.json({ message: 'Ticket anulado correctamente', current_balance });
});

// ─── POST /api/tickets/shift-changes — registrar cambio de turno ──────────────
router.post('/shift-changes', auth, (req, res) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ error: 'Solo los empleados pueden registrar cambios de turno' });
  }

  const session = getActiveSession();
  if (!session) return res.status(400).json({ error: 'No hay sesión activa para hoy' });

  const { incoming_user, cash_at_change, password } = req.body;
  if (!incoming_user) return res.status(400).json({ error: 'El empleado entrante es requerido' });
  if (!password) return res.status(400).json({ error: 'La contraseña del empleado entrante es requerida' });
  if (incoming_user === req.user.id) {
    return res.status(400).json({ error: 'El empleado entrante debe ser diferente al saliente' });
  }

  const incoming = db.prepare(
    "SELECT id, name, email, role, password_hash FROM users WHERE id = ? AND role = 'employee' AND active = 1"
  ).get(incoming_user);
  if (!incoming) return res.status(404).json({ error: 'Empleado entrante no encontrado' });

  const validPassword = bcrypt.compareSync(password, incoming.password_hash);
  if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });

  const expected_at_change = getCurrentBalance(session.id, session.initial_balance);
  const cash = cash_at_change !== undefined && cash_at_change !== null
    ? parseFloat(cash_at_change)
    : null;
  const difference = cash !== null ? cash - expected_at_change : null;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO supplier_shift_changes
      (id, session_id, outgoing_user, incoming_user, cash_at_change, expected_at_change, difference_at_change, changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, session.id, req.user.id, incoming_user, cash, expected_at_change, difference, getLocalISOString());

  const change = db.prepare(`
    SELECT sc.*, u_out.name AS outgoing_name, u_in.name AS incoming_name
    FROM supplier_shift_changes sc
    JOIN users u_out ON sc.outgoing_user = u_out.id
    JOIN users u_in ON sc.incoming_user = u_in.id
    WHERE sc.id = ?
  `).get(id);

  // Generar token JWT para el usuario entrante (hereda la caja del saliente)
  const inheritedCaja = req.user.caja || 3;
  const newToken = jwt.sign(
    { id: incoming.id, role: incoming.role, name: incoming.name, caja: inheritedCaja },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  // Transferir lock de caja 3 al usuario entrante
  if (inheritedCaja === 3) {
    db.prepare(`
      UPDATE caja_locks SET user_id = ?, user_name = ?,
        locked_at = datetime('now','localtime'),
        expires_at = datetime('now','localtime','+8 hours')
      WHERE caja = 3
    `).run(incoming.id, incoming.name);
  }

  res.status(201).json({
    ...change,
    token: newToken,
    user: { id: incoming.id, role: incoming.role, name: incoming.name, caja: inheritedCaja }
  });
});

module.exports = router;
