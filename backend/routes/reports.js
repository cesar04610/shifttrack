const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const db = require('../db/database');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/role');

// GET /api/reports/attendance?start=YYYY-MM-DD&end=YYYY-MM-DD&employee_id=
router.get('/attendance', auth, requireAdmin, (req, res) => {
  const { start, end, employee_id } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'Fechas start y end requeridas' });
  }

  let query = `
    SELECT
      cr.id, cr.date, cr.clock_in, cr.clock_out, cr.hours_worked,
      u.name as employee_name, u.email as employee_email,
      s.start_time as scheduled_start, s.end_time as scheduled_end
    FROM clock_records cr
    JOIN users u ON cr.employee_id = u.id
    LEFT JOIN schedules s ON cr.schedule_id = s.id
    WHERE cr.date BETWEEN ? AND ?
  `;
  const params = [start, end];

  if (employee_id) {
    query += ' AND cr.employee_id = ?';
    params.push(employee_id);
  }
  query += ' ORDER BY cr.date DESC, u.name ASC';

  const records = db.prepare(query).all(...params);
  res.json(records);
});

// GET /api/reports/absences?date=YYYY-MM-DD
router.get('/absences', auth, requireAdmin, (req, res) => {
  const { getLocalToday } = require('../utils/dateUtils');
  const date = req.query.date || getLocalToday();

  const absences = db.prepare(`
    SELECT
      s.id as schedule_id, s.date, s.start_time, s.end_time,
      u.id as employee_id, u.name as employee_name, u.email as employee_email,
      cr.id as clock_record_id, cr.clock_in
    FROM schedules s
    JOIN users u ON s.employee_id = u.id
    LEFT JOIN clock_records cr ON cr.employee_id = s.employee_id AND cr.date = s.date
    WHERE s.date = ? AND u.active = 1
    ORDER BY s.start_time ASC, u.name ASC
  `).all(date);

  // Enriquecer con estado
  const result = absences.map(r => ({
    ...r,
    status: r.clock_in ? 'fichado' : 'ausente'
  }));

  res.json(result);
});

// GET /api/reports/export?start=YYYY-MM-DD&end=YYYY-MM-DD&employee_id=
router.get('/export', auth, requireAdmin, async (req, res) => {
  const { start, end, employee_id } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'Fechas start y end requeridas' });
  }

  let query = `
    SELECT
      u.name as employee_name, u.email,
      cr.date, cr.clock_in, cr.clock_out, cr.hours_worked,
      s.start_time as turno_inicio, s.end_time as turno_fin
    FROM clock_records cr
    JOIN users u ON cr.employee_id = u.id
    LEFT JOIN schedules s ON cr.schedule_id = s.id
    WHERE cr.date BETWEEN ? AND ?
  `;
  const params = [start, end];
  if (employee_id) { query += ' AND cr.employee_id = ?'; params.push(employee_id); }
  query += ' ORDER BY u.name ASC, cr.date ASC';

  const records = db.prepare(query).all(...params);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Reporte de Horas');

  sheet.columns = [
    { header: 'Empleado', key: 'employee_name', width: 25 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Fecha', key: 'date', width: 14 },
    { header: 'Turno Inicio', key: 'turno_inicio', width: 14 },
    { header: 'Turno Fin', key: 'turno_fin', width: 14 },
    { header: 'Entrada Real', key: 'clock_in', width: 22 },
    { header: 'Salida Real', key: 'clock_out', width: 22 },
    { header: 'Horas Trabajadas', key: 'hours_worked', width: 18 },
  ];

  // Estilo encabezado
  sheet.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    cell.alignment = { horizontal: 'center' };
  });

  records.forEach(r => {
    sheet.addRow({
      employee_name: r.employee_name,
      email: r.email,
      date: r.date,
      turno_inicio: r.turno_inicio || '—',
      turno_fin: r.turno_fin || '—',
      clock_in: r.clock_in ? formatDateTime(r.clock_in) : '—',
      clock_out: r.clock_out ? formatDateTime(r.clock_out) : '—',
      hours_worked: r.hours_worked !== null ? r.hours_worked : '—',
    });
  });

  // Fila de totales por empleado
  // (simplificado: totales generales al final)
  const totalHours = records.reduce((sum, r) => sum + (r.hours_worked || 0), 0);
  const totalRow = sheet.addRow(['', '', '', '', '', '', 'TOTAL HORAS:', Math.round(totalHours * 100) / 100]);
  totalRow.getCell(7).font = { bold: true };
  totalRow.getCell(8).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=reporte_${start}_${end}.xlsx`);

  await workbook.xlsx.write(res);
  res.end();
});

// GET /api/reports/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/summary', auth, requireAdmin, (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'Fechas requeridas' });

  const summary = db.prepare(`
    SELECT
      u.id, u.name, u.email,
      COUNT(cr.id) as total_dias,
      ROUND(SUM(COALESCE(cr.hours_worked, 0)), 2) as total_horas,
      COUNT(CASE WHEN cr.clock_out IS NULL THEN 1 END) as dias_sin_salida
    FROM users u
    LEFT JOIN clock_records cr ON cr.employee_id = u.id AND cr.date BETWEEN ? AND ?
    WHERE u.role = 'employee' AND u.active = 1
    GROUP BY u.id, u.name, u.email
    ORDER BY u.name ASC
  `).all(start, end);

  res.json(summary);
});

// Alertas: GET /api/reports/alert-config
router.get('/alert-config', auth, requireAdmin, (req, res) => {
  const config = db.prepare("SELECT * FROM alert_config WHERE admin_id = ?").get(req.user.id);
  res.json(config || { tolerance_minutes: 15, email_active: 1 });
});

// PUT /api/reports/alert-config
router.put('/alert-config', auth, requireAdmin, (req, res) => {
  const { tolerance_minutes, email_active } = req.body;
  const existing = db.prepare("SELECT id FROM alert_config WHERE admin_id = ?").get(req.user.id);

  if (existing) {
    db.prepare(`
      UPDATE alert_config SET tolerance_minutes = ?, email_active = ? WHERE admin_id = ?
    `).run(tolerance_minutes ?? 15, email_active ? 1 : 0, req.user.id);
  } else {
    const { v4: uuidv4 } = require('uuid');
    db.prepare(`
      INSERT INTO alert_config (id, admin_id, tolerance_minutes, email_active)
      VALUES (?, ?, ?, ?)
    `).run(require('uuid').v4(), req.user.id, tolerance_minutes ?? 15, email_active ? 1 : 0);
  }

  res.json({ message: 'Configuración guardada' });
});

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('es-MX') + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

module.exports = router;
