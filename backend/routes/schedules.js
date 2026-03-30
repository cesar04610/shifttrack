const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/role');

// GET /api/schedules?week=YYYY-MM-DD  (lunes de la semana)
// Admin: todos los turnos; Empleado: solo los suyos
router.get('/', auth, (req, res) => {
  const { week } = req.query;
  let query, params;

  if (week) {
    // Calcular fin de semana (domingo = lunes + 6 días)
    const monday = week;
    const sunday = addDays(monday, 6);

    if (req.user.role === 'admin') {
      query = `
        SELECT s.*, u.name as employee_name, u.email as employee_email
        FROM schedules s
        JOIN users u ON s.employee_id = u.id
        WHERE s.date BETWEEN ? AND ?
        ORDER BY s.date ASC, s.start_time ASC
      `;
      params = [monday, sunday];
    } else {
      query = `
        SELECT s.*, u.name as employee_name
        FROM schedules s
        JOIN users u ON s.employee_id = u.id
        WHERE s.employee_id = ? AND s.date BETWEEN ? AND ?
        ORDER BY s.date ASC, s.start_time ASC
      `;
      params = [req.user.id, monday, sunday];
    }
  } else {
    if (req.user.role === 'admin') {
      query = `
        SELECT s.*, u.name as employee_name, u.email as employee_email
        FROM schedules s
        JOIN users u ON s.employee_id = u.id
        ORDER BY s.date DESC, s.start_time ASC
        LIMIT 200
      `;
      params = [];
    } else {
      // Empleado: esta semana y la siguiente
      const { getLocalToday } = require('../utils/dateUtils');
      const today = getLocalToday();
      query = `
        SELECT s.*, u.name as employee_name
        FROM schedules s
        JOIN users u ON s.employee_id = u.id
        WHERE s.employee_id = ? AND s.date >= ?
        ORDER BY s.date ASC, s.start_time ASC
        LIMIT 50
      `;
      params = [req.user.id, today];
    }
  }

  const schedules = db.prepare(query).all(...params);
  res.json(schedules);
});

// POST /api/schedules — crear turno (admin)
router.post('/', auth, requireAdmin, (req, res) => {
  const { employee_id, date, start_time, end_time } = req.body;
  if (!employee_id || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Empleado, fecha, hora inicio y hora fin son requeridos' });
  }

  const employee = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'employee' AND active = 1").get(employee_id);
  if (!employee) return res.status(404).json({ error: 'Empleado no encontrado o inactivo' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO schedules (id, employee_id, date, start_time, end_time)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, employee_id, date, start_time, end_time);

  const created = db.prepare(`
    SELECT s.*, u.name as employee_name, u.email as employee_email
    FROM schedules s JOIN users u ON s.employee_id = u.id
    WHERE s.id = ?
  `).get(id);
  res.status(201).json(created);
});

// PUT /api/schedules/:id — editar turno (admin)
router.put('/:id', auth, requireAdmin, (req, res) => {
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Turno no encontrado' });

  const { date, start_time, end_time, employee_id } = req.body;
  db.prepare(`
    UPDATE schedules SET
      date = COALESCE(?, date),
      start_time = COALESCE(?, start_time),
      end_time = COALESCE(?, end_time),
      employee_id = COALESCE(?, employee_id)
    WHERE id = ?
  `).run(date || null, start_time || null, end_time || null, employee_id || null, req.params.id);

  const updated = db.prepare(`
    SELECT s.*, u.name as employee_name, u.email as employee_email
    FROM schedules s JOIN users u ON s.employee_id = u.id
    WHERE s.id = ?
  `).get(req.params.id);
  res.json(updated);
});

// DELETE /api/schedules/:id — eliminar turno (admin)
router.delete('/:id', auth, requireAdmin, (req, res) => {
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Turno no encontrado' });

  db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  res.json({ message: 'Turno eliminado' });
});

// POST /api/schedules/clone — clonar semana (admin)
router.post('/clone', auth, requireAdmin, (req, res) => {
  const { from_week, to_week } = req.body; // YYYY-MM-DD (lunes de cada semana)
  if (!from_week || !to_week) {
    return res.status(400).json({ error: 'from_week y to_week son requeridos' });
  }

  const fromMonday = from_week;
  const fromSunday = addDays(fromMonday, 6);
  const sourceSchedules = db.prepare('SELECT * FROM schedules WHERE date BETWEEN ? AND ?').all(fromMonday, fromSunday);

  if (sourceSchedules.length === 0) {
    return res.status(404).json({ error: 'No hay turnos en la semana origen' });
  }

  const diffDays = daysDiff(fromMonday, to_week);
  db.exec('BEGIN TRANSACTION');
  try {
    sourceSchedules.forEach(s => {
      const newDate = addDays(s.date, diffDays);
      db.prepare(`
        INSERT OR IGNORE INTO schedules (id, employee_id, date, start_time, end_time)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), s.employee_id, newDate, s.start_time, s.end_time);
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  res.json({ message: `${sourceSchedules.length} turno(s) clonados correctamente` });
});

// Utilidades de fechas (sin dependencias externas)
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function daysDiff(from, to) {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

module.exports = router;
