const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/role');
const ExcelJS = require('exceljs');
const { getLocalToday, getLocalISOString } = require('../utils/dateUtils');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getConfig() {
  return db.prepare('SELECT * FROM cuts_config WHERE id = ?').get('default');
}

function getIsoDay(dateStr) {
  // dateStr: 'YYYY-MM-DD'
  const d = new Date(dateStr + 'T12:00:00');
  const js = d.getDay(); // 0=Sun
  return js === 0 ? 7 : js;
}

function getReliabilityLevel(sampleCount) {
  if (sampleCount < 5) return 'none';
  if (sampleCount < 15) return 'low';
  if (sampleCount < 30) return 'medium';
  return 'high';
}

// ── GET /api/cuts/active-shift — turno activo del usuario hoy ────────────────
router.get('/active-shift', auth, (req, res) => {
  const today = getLocalToday();

  // Buscar clock_in del día (con o sin turno programado)
  const clockRecord = db.prepare(`
    SELECT cr.id AS clock_id, cr.clock_in, cr.schedule_id
    FROM clock_records cr
    WHERE cr.employee_id = ? AND cr.date = ?
    ORDER BY cr.clock_in DESC LIMIT 1
  `).get(req.user.id, today);

  if (!clockRecord) {
    return res.json({ has_active_shift: false });
  }

  // Si tiene turno programado, incluir sus datos
  const schedule = clockRecord.schedule_id
    ? db.prepare('SELECT * FROM schedules WHERE id = ?').get(clockRecord.schedule_id)
    : null;

  // Determinar turno actual (mañana: 7:30–17:00, tarde: resto)
  const now = new Date();
  const minutesOfDay = now.getHours() * 60 + now.getMinutes();
  const currentShift = (minutesOfDay >= 450 && minutesOfDay < 1020) ? 'Mañana' : 'Tarde';

  // Verificar si ya tiene corte hoy para este turno
  const existingCut = db.prepare(
    'SELECT id, submitted_at, shift_label FROM cash_register_cuts WHERE employee_id = ? AND date = ? AND shift_label = ?'
  ).get(req.user.id, today, currentShift);

  res.json({
    has_active_shift: true,
    schedule: schedule || { id: null, date: today, start_time: null, end_time: null },
    clock_record: clockRecord,
    existing_cut: existingCut || null,
    current_shift: currentShift,
  });
});

// ── GET /api/cuts/my-cuts — historial del usuario autenticado ────────────────
router.get('/my-cuts', auth, (req, res) => {
  const cuts = db.prepare(`
    SELECT c.*, COALESCE(c.date, s.date) AS shift_date, s.start_time, s.end_time
    FROM cash_register_cuts c
    LEFT JOIN schedules s ON c.schedule_id = s.id
    WHERE c.employee_id = ?
    ORDER BY c.submitted_at DESC
    LIMIT 60
  `).all(req.user.id);
  res.json(cuts);
});

// ── GET /api/cuts/summary — resumen del día (admin) ──────────────────────────
router.get('/summary', auth, requireAdmin, (req, res) => {
  const today = getLocalToday();

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_cuts,
      COALESCE(SUM(total_sales), 0) AS total_sales,
      COALESCE(SUM(ABS(cash_difference)), 0) AS total_diff,
      SUM(CASE WHEN is_anomaly = 1 THEN 1 ELSE 0 END) AS anomaly_count
    FROM cash_register_cuts c
    LEFT JOIN schedules s ON c.schedule_id = s.id
    WHERE COALESCE(c.date, s.date) = ?
  `).get(today);

  // Turnos del día con fichaje, sin corte
  const pendingCount = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM schedules s
    LEFT JOIN cash_register_cuts c ON c.schedule_id = s.id
    LEFT JOIN clock_records cr ON cr.employee_id = s.employee_id AND cr.date = s.date
    WHERE s.date = ? AND c.id IS NULL AND cr.id IS NOT NULL
  `).get(today);

  const unseen = db.prepare(
    "SELECT COUNT(*) AS cnt FROM cut_alerts WHERE is_seen = 0"
  ).get();

  res.json({ ...stats, pending_cuts: pendingCount.cnt, unseen_alerts: unseen.cnt });
});

// ── GET /api/cuts/trends — datos para gráfica (admin) ────────────────────────
router.get('/trends', auth, requireAdmin, (req, res) => {
  const { employee_id, register, period, from, to } = req.query;
  let fromDate, toDate;
  const today = getLocalToday();

  function daysAgo(n) {
    const d = new Date(); d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  if (period === 'week') {
    fromDate = daysAgo(7);
    toDate = today;
  } else if (period === 'month') {
    fromDate = daysAgo(30);
    toDate = today;
  } else {
    fromDate = from || daysAgo(7);
    toDate = to || today;
  }

  let query = `
    SELECT c.id, c.total_sales, c.card_payments, c.declared_cash,
           c.expected_cash, c.cash_difference,
           c.register_name, c.is_anomaly, c.deviation_pct,
           c.submitted_at,
           COALESCE(c.date, s.date) AS shift_date, s.start_time, s.end_time,
           u.id AS employee_id, u.name AS employee_name
    FROM cash_register_cuts c
    LEFT JOIN schedules s ON c.schedule_id = s.id
    JOIN users u ON c.employee_id = u.id
    WHERE COALESCE(c.date, s.date) BETWEEN ? AND ?
  `;
  const params = [fromDate, toDate];

  if (employee_id) { query += ' AND c.employee_id = ?'; params.push(employee_id); }
  if (register) { query += ' AND c.register_name = ?'; params.push(register); }
  query += ' ORDER BY shift_date ASC, c.submitted_at ASC';

  const cuts = db.prepare(query).all(...params);
  res.json({ cuts, from: fromDate, to: toDate });
});

// ── GET /api/cuts/alerts — lista de alertas (admin) ───────────────────────────
router.get('/alerts', auth, requireAdmin, (req, res) => {
  const { type, is_seen, from, to } = req.query;
  let query = `
    SELECT a.*, u.name AS employee_name,
           s.date AS shift_date, s.start_time, s.end_time
    FROM cut_alerts a
    JOIN users u ON a.employee_id = u.id
    LEFT JOIN schedules s ON a.schedule_id = s.id
    WHERE 1=1
  `;
  const params = [];
  if (type) { query += ' AND a.alert_type = ?'; params.push(type); }
  if (is_seen !== undefined) { query += ' AND a.is_seen = ?'; params.push(is_seen === 'true' ? 1 : 0); }
  if (from) { query += " AND date(a.created_at, 'localtime') >= ?"; params.push(from); }
  if (to) { query += " AND date(a.created_at, 'localtime') <= ?"; params.push(to); }
  query += ' ORDER BY a.created_at DESC LIMIT 200';

  res.json(db.prepare(query).all(...params));
});

// ── PATCH /api/cuts/alerts/:id/seen — marcar alerta vista (admin) ─────────────
router.patch('/alerts/:id/seen', auth, requireAdmin, (req, res) => {
  const alert = db.prepare('SELECT id FROM cut_alerts WHERE id = ?').get(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alerta no encontrada' });

  db.prepare(
    'UPDATE cut_alerts SET is_seen = 1, seen_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(req.params.id);
  res.json({ ok: true });
});

// ── PATCH /api/cuts/alerts/seen-all — marcar todas vistas (admin) ─────────────
router.patch('/alerts/seen-all', auth, requireAdmin, (req, res) => {
  db.prepare("UPDATE cut_alerts SET is_seen = 1, seen_at = CURRENT_TIMESTAMP WHERE is_seen = 0").run();
  res.json({ ok: true });
});

// ── GET /api/cuts/baselines — estado de promedios (admin) ─────────────────────
router.get('/baselines', auth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, u.name AS employee_name
    FROM cut_baselines b
    JOIN users u ON b.employee_id = u.id
    ORDER BY u.name ASC, b.register_name ASC, b.day_of_week ASC
  `).all();
  res.json(rows.map(r => ({ ...r, reliability: getReliabilityLevel(r.sample_count) })));
});

// ── GET /api/cuts/config — obtener config (admin) ────────────────────────────
router.get('/config', auth, requireAdmin, (req, res) => {
  res.json(getConfig());
});

// ── PUT /api/cuts/config — actualizar config (admin) ─────────────────────────
router.put('/config', auth, requireAdmin, (req, res) => {
  const {
    diff_yellow_threshold, diff_red_threshold,
    anomaly_threshold_pct, min_samples_for_anomaly,
    missing_cut_delay_min, email_missing_cut,
  } = req.body;

  db.prepare(`
    UPDATE cuts_config SET
      diff_yellow_threshold   = COALESCE(?, diff_yellow_threshold),
      diff_red_threshold      = COALESCE(?, diff_red_threshold),
      anomaly_threshold_pct   = COALESCE(?, anomaly_threshold_pct),
      min_samples_for_anomaly = COALESCE(?, min_samples_for_anomaly),
      missing_cut_delay_min   = COALESCE(?, missing_cut_delay_min),
      email_missing_cut       = COALESCE(?, email_missing_cut),
      updated_at              = CURRENT_TIMESTAMP
    WHERE id = 'default'
  `).run(
    diff_yellow_threshold ?? null,
    diff_red_threshold ?? null,
    anomaly_threshold_pct ?? null,
    min_samples_for_anomaly ?? null,
    missing_cut_delay_min ?? null,
    email_missing_cut !== undefined ? (email_missing_cut ? 1 : 0) : null,
  );

  res.json(getConfig());
});

// ── GET /api/cuts/report — exportar .xlsx (admin) ────────────────────────────
router.get('/report', auth, requireAdmin, async (req, res) => {
  const { from, to, employee_id } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Parámetros from y to son requeridos' });

  let query = `
    SELECT c.*, COALESCE(c.date, s.date) AS shift_date, s.start_time, s.end_time,
           u.name AS employee_name
    FROM cash_register_cuts c
    LEFT JOIN schedules s ON c.schedule_id = s.id
    JOIN users u ON c.employee_id = u.id
    WHERE COALESCE(c.date, s.date) BETWEEN ? AND ?
  `;
  const params = [from, to];
  if (employee_id) { query += ' AND c.employee_id = ?'; params.push(employee_id); }
  query += ' ORDER BY shift_date ASC, c.submitted_at ASC';

  const cuts = db.prepare(query).all(...params);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Cortes de Caja');
  sheet.columns = [
    { header: 'Fecha',           key: 'shift_date',      width: 13 },
    { header: 'Empleado',        key: 'employee_name',   width: 22 },
    { header: 'Caja',            key: 'register_name',   width: 14 },
    { header: 'Turno',           key: 'turno',           width: 14 },
    { header: 'Ventas Totales',  key: 'total_sales',     width: 16 },
    { header: 'Tarjeta',         key: 'card_payments',   width: 14 },
    { header: 'Efectivo Esp.',   key: 'expected_cash',   width: 16 },
    { header: 'Efectivo Decl.',  key: 'declared_cash',   width: 16 },
    { header: 'Diferencia',      key: 'cash_difference', width: 14 },
    { header: 'Anomalía',        key: 'anomaly',         width: 10 },
    { header: 'Desviación %',    key: 'deviation_pct',   width: 14 },
    { header: 'Notas',           key: 'notes',           width: 30 },
    { header: 'Registrado',      key: 'submitted_at',    width: 20 },
  ];

  sheet.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    cell.alignment = { horizontal: 'center' };
  });

  for (const c of cuts) {
    sheet.addRow({
      shift_date:      c.shift_date,
      employee_name:   c.employee_name,
      register_name:   c.register_name,
      turno:           `${c.start_time}–${c.end_time}`,
      total_sales:     c.total_sales,
      card_payments:   c.card_payments,
      expected_cash:   c.expected_cash,
      declared_cash:   c.declared_cash,
      cash_difference: c.cash_difference,
      anomaly:         c.is_anomaly ? 'Sí' : 'No',
      deviation_pct:   c.deviation_pct != null ? `${c.deviation_pct}%` : '—',
      notes:           c.notes || '—',
      submitted_at:    new Date(c.submitted_at).toLocaleString('es-MX'),
    });
  }

  ['total_sales','card_payments','expected_cash','declared_cash','cash_difference']
    .forEach(k => { sheet.getColumn(k).numFmt = '"$"#,##0.00'; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=cortes_${from}_${to}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

// ── GET /api/cuts — lista admin con filtros ───────────────────────────────────
router.get('/', auth, requireAdmin, (req, res) => {
  const { employee_id, register, from, to, shift_label } = req.query;
  let query = `
    SELECT c.*, COALESCE(c.date, s.date) AS shift_date, s.start_time, s.end_time,
           u.name AS employee_name
    FROM cash_register_cuts c
    LEFT JOIN schedules s ON c.schedule_id = s.id
    JOIN users u ON c.employee_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (employee_id) { query += ' AND c.employee_id = ?'; params.push(employee_id); }
  if (register) { query += ' AND c.register_name = ?'; params.push(register); }
  if (shift_label) { query += ' AND c.shift_label = ?'; params.push(shift_label); }
  if (from) { query += ' AND COALESCE(c.date, s.date) >= ?'; params.push(from); }
  if (to) { query += ' AND COALESCE(c.date, s.date) <= ?'; params.push(to); }
  query += ' ORDER BY shift_date DESC, c.submitted_at DESC LIMIT 500';

  res.json(db.prepare(query).all(...params));
});

// ── GET /api/cuts/:id — detalle de corte (admin) ──────────────────────────────
router.get('/:id', auth, requireAdmin, (req, res) => {
  const cut = db.prepare(`
    SELECT c.*, COALESCE(c.date, s.date) AS shift_date, s.start_time, s.end_time,
           u.name AS employee_name
    FROM cash_register_cuts c
    LEFT JOIN schedules s ON c.schedule_id = s.id
    JOIN users u ON c.employee_id = u.id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!cut) return res.status(404).json({ error: 'Corte no encontrado' });
  res.json(cut);
});

// ── POST /api/cuts — registrar corte ─────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ error: 'Solo los empleados pueden registrar cortes' });
  }

  const today = getLocalToday();
  const { register_name, total_sales, card_payments, declared_cash, notes } = req.body;

  if (!register_name?.trim()) return res.status(400).json({ error: 'El nombre de la caja es requerido' });
  if (total_sales === undefined || total_sales === null) return res.status(400).json({ error: 'Las ventas totales son requeridas' });
  if (card_payments === undefined || card_payments === null) return res.status(400).json({ error: 'Los pagos con tarjeta son requeridos' });
  if (declared_cash === undefined || declared_cash === null) return res.status(400).json({ error: 'El efectivo declarado es requerido' });
  if (parseFloat(total_sales) < 0 || parseFloat(card_payments) < 0 || parseFloat(declared_cash) < 0) {
    return res.status(400).json({ error: 'Los valores no pueden ser negativos' });
  }

  // Validar que tenga fichaje de entrada hoy
  const clockRecord = db.prepare(`
    SELECT id, schedule_id FROM clock_records
    WHERE employee_id = ? AND date = ?
    ORDER BY clock_in DESC LIMIT 1
  `).get(req.user.id, today);

  if (!clockRecord) {
    return res.status(400).json({ error: 'No tienes un fichaje de entrada registrado para hoy' });
  }

  const scheduleId = clockRecord.schedule_id || null;

  // Determinar turno (mañana: 7:30–17:00, tarde: resto)
  const now = new Date();
  const minutesOfDay = now.getHours() * 60 + now.getMinutes();
  const shift_label = (minutesOfDay >= 450 && minutesOfDay < 1020) ? 'Mañana' : 'Tarde';

  // Verificar que no exista corte previo hoy para este turno
  const existingCut = db.prepare(
    'SELECT id FROM cash_register_cuts WHERE employee_id = ? AND date = ? AND shift_label = ?'
  ).get(req.user.id, today, shift_label);
  if (existingCut) {
    return res.status(409).json({ error: `Ya registraste tu corte de ${shift_label.toLowerCase()} hoy` });
  }

  // Cálculos del servidor
  const ts = parseFloat(total_sales);
  const cp = parseFloat(card_payments);
  const dc = parseFloat(declared_cash);
  const expected_cash = ts - cp;
  const cash_difference = dc - expected_cash; // positivo = sobrante, negativo = faltante

  // Obtener config y baseline
  const config = getConfig();
  const isoDay = getIsoDay(today);

  const baseline = db.prepare(`
    SELECT * FROM cut_baselines
    WHERE employee_id = ? AND register_name = ? AND day_of_week = ?
  `).get(req.user.id, register_name.trim(), isoDay);

  // Detectar anomalía
  let is_anomaly = 0;
  let deviation_pct = null;
  if (baseline && baseline.sample_count >= config.min_samples_for_anomaly && baseline.avg_total_sales > 0) {
    const dev = Math.abs((ts - baseline.avg_total_sales) / baseline.avg_total_sales * 100);
    if (dev > config.anomaly_threshold_pct) {
      is_anomaly = 1;
      deviation_pct = parseFloat(dev.toFixed(2));
    }
  }

  // Transacción manual
  try {
    db.exec('BEGIN');

    const cutId = uuidv4();
    db.prepare(`
      INSERT INTO cash_register_cuts
        (id, employee_id, schedule_id, register_name, total_sales, card_payments,
         declared_cash, notes, expected_cash, cash_difference, is_anomaly, deviation_pct, date, shift_label, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(cutId, req.user.id, scheduleId, register_name.trim(), ts, cp, dc,
           notes?.trim() || null, expected_cash, cash_difference, is_anomaly, deviation_pct, today, shift_label, getLocalISOString());

    // UPSERT baseline — recalcular promedio con AVG desde la tabla
    if (baseline) {
      const newAvg = db.prepare(`
        SELECT AVG(c.total_sales) AS avg
        FROM cash_register_cuts c
        WHERE c.employee_id = ? AND c.register_name = ?
          AND CASE WHEN strftime('%w', COALESCE(c.date, (SELECT s.date FROM schedules s WHERE s.id = c.schedule_id))) = '0' THEN 7
                   ELSE CAST(strftime('%w', COALESCE(c.date, (SELECT s.date FROM schedules s WHERE s.id = c.schedule_id))) AS INTEGER) END = ?
      `).get(req.user.id, register_name.trim(), isoDay);

      db.prepare(`
        UPDATE cut_baselines SET
          avg_total_sales = ?, sample_count = sample_count + 1, last_updated = CURRENT_TIMESTAMP
        WHERE employee_id = ? AND register_name = ? AND day_of_week = ?
      `).run(newAvg.avg, req.user.id, register_name.trim(), isoDay);
    } else {
      db.prepare(`
        INSERT INTO cut_baselines (id, employee_id, register_name, day_of_week, avg_total_sales, sample_count)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(uuidv4(), req.user.id, register_name.trim(), isoDay, ts);
    }

    // Si es anomalía: insertar alerta
    if (is_anomaly) {
      db.prepare(`
        INSERT INTO cut_alerts (id, alert_type, employee_id, schedule_id, cut_id,
          deviation_pct, avg_reference, sample_count)
        VALUES (?, 'anomaly_detected', ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), req.user.id, scheduleId, cutId, deviation_pct,
             baseline?.avg_total_sales || null, baseline?.sample_count || null);
    }

    db.exec('COMMIT');

    const cut = db.prepare(`
      SELECT c.*, COALESCE(c.date, s.date) AS shift_date, s.start_time, s.end_time, u.name AS employee_name
      FROM cash_register_cuts c
      LEFT JOIN schedules s ON c.schedule_id = s.id
      JOIN users u ON c.employee_id = u.id
      WHERE c.id = ?
    `).get(cutId);

    res.status(201).json({ cut, is_anomaly: is_anomaly === 1, deviation_pct });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[CUTS] Error al registrar corte:', err.message);
    res.status(500).json({ error: 'Error interno al registrar el corte' });
  }
});

module.exports = router;
