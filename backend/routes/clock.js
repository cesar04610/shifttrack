const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const auth = require('../middleware/auth');
const { getLocalToday, getLocalISOString } = require('../utils/dateUtils');

// GET /api/clock/status — estado actual del fichaje del empleado
router.get('/status', auth, (req, res) => {
  const today = getLocalToday();
  const record = db.prepare(`
    SELECT * FROM clock_records
    WHERE employee_id = ? AND date = ? AND clock_out IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(req.user.id, today);

  res.json({ active_clock_in: record || null });
});

// POST /api/clock/in — registrar entrada
router.post('/in', auth, (req, res) => {
  const { lat, lng, schedule_id } = req.body;
  const now = new Date();
  const today = getLocalToday();

  // Verificar si ya hay una entrada sin salida
  const existing = db.prepare(`
    SELECT id FROM clock_records
    WHERE employee_id = ? AND date = ? AND clock_out IS NULL
  `).get(req.user.id, today);

  if (existing) {
    return res.status(409).json({ error: 'Ya tienes una entrada activa sin salida registrada' });
  }

  const id = uuidv4();
  const clockIn = getLocalISOString(now);

  db.prepare(`
    INSERT INTO clock_records (id, employee_id, schedule_id, clock_in, date, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, schedule_id || null, clockIn, today, lat || null, lng || null);

  const record = db.prepare('SELECT * FROM clock_records WHERE id = ?').get(id);
  res.status(201).json(record);
});

// POST /api/clock/out — registrar salida
router.post('/out', auth, (req, res) => {
  const { lat, lng } = req.body;
  const today = getLocalToday();

  const record = db.prepare(`
    SELECT * FROM clock_records
    WHERE employee_id = ? AND date = ? AND clock_out IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(req.user.id, today);

  if (!record) {
    return res.status(404).json({ error: 'No tienes una entrada activa para registrar salida' });
  }

  const now = new Date();
  const clockOut = getLocalISOString(now);
  const clockInTime = new Date(record.clock_in);
  const hoursWorked = (now - clockInTime) / 3600000;

  db.prepare(`
    UPDATE clock_records
    SET clock_out = ?, hours_worked = ?
    WHERE id = ?
  `).run(clockOut, Math.round(hoursWorked * 100) / 100, record.id);

  const updated = db.prepare('SELECT * FROM clock_records WHERE id = ?').get(record.id);
  res.json(updated);
});

// GET /api/clock/today — registros del día para el empleado actual
router.get('/today', auth, (req, res) => {
  const today = getLocalToday();
  const records = db.prepare(`
    SELECT * FROM clock_records
    WHERE employee_id = ? AND date = ?
    ORDER BY created_at ASC
  `).all(req.user.id, today);
  res.json(records);
});

module.exports = router;
