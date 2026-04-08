const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const db = require('../db/database');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/role');

// GET /api/analytics/spending?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/spending', auth, requireAdmin, (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Parámetros from y to son requeridos' });

  const total = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM purchase_tickets
    WHERE date(registered_at, 'localtime') BETWEEN ? AND ? AND is_voided = 0
  `).get(from, to);

  const byDay = db.prepare(`
    SELECT date(registered_at, 'localtime') AS day, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS ticket_count
    FROM purchase_tickets
    WHERE date(registered_at, 'localtime') BETWEEN ? AND ? AND is_voided = 0
    GROUP BY date(registered_at, 'localtime')
    ORDER BY day ASC
  `).all(from, to);

  const bySupplier = db.prepare(`
    SELECT s.id, s.company_name, s.rep_name,
           COALESCE(SUM(pt.amount), 0) AS total,
           COUNT(*) AS ticket_count
    FROM purchase_tickets pt
    JOIN suppliers s ON pt.supplier_id = s.id
    WHERE date(pt.registered_at, 'localtime') BETWEEN ? AND ? AND pt.is_voided = 0
    GROUP BY s.id, s.company_name, s.rep_name
    ORDER BY total DESC
  `).all(from, to);

  res.json({ total: total.total, byDay, bySupplier });
});

// GET /api/analytics/supplier-avg — promedio de ticket por proveedor y día de semana
router.get('/supplier-avg', auth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT
      s.id AS supplier_id,
      s.company_name,
      CASE WHEN strftime('%w', pt.registered_at, 'localtime') = '0' THEN 7
           ELSE CAST(strftime('%w', pt.registered_at, 'localtime') AS INTEGER) END AS day_of_week,
      AVG(pt.amount) AS avg_amount,
      COUNT(*)       AS ticket_count
    FROM purchase_tickets pt
    JOIN suppliers s ON pt.supplier_id = s.id
    WHERE pt.is_voided = 0
    GROUP BY s.id, s.company_name, day_of_week
    ORDER BY s.company_name ASC, day_of_week ASC
  `).all();

  const map = {};
  for (const row of rows) {
    if (!map[row.supplier_id]) {
      map[row.supplier_id] = { supplier_id: row.supplier_id, company_name: row.company_name, averages: {}, counts: {} };
    }
    map[row.supplier_id].averages[row.day_of_week] = parseFloat(row.avg_amount.toFixed(2));
    map[row.supplier_id].counts[row.day_of_week] = row.ticket_count;
  }

  res.json(Object.values(map));
});

// GET /api/analytics/cash-audits?from=&to= — historial de cuadres de caja
router.get('/cash-audits', auth, requireAdmin, (req, res) => {
  const { from, to } = req.query;
  let query = `
    SELECT ds.*,
           u_open.name  AS opened_by_name,
           u_close.name AS closed_by_name
    FROM daily_sessions ds
    LEFT JOIN users u_open  ON ds.opened_by = u_open.id
    LEFT JOIN users u_close ON ds.closed_by = u_close.id
    WHERE 1=1
  `;
  const params = [];
  if (from) { query += ' AND ds.session_date >= ?'; params.push(from); }
  if (to)   { query += ' AND ds.session_date <= ?'; params.push(to); }
  query += ' ORDER BY ds.session_date DESC';

  const sessions = db.prepare(query).all(...params);

  const stmtShiftChanges = db.prepare(`
    SELECT sc.*, u_out.name AS outgoing_name, u_in.name AS incoming_name
    FROM supplier_shift_changes sc
    JOIN users u_out ON sc.outgoing_user = u_out.id
    JOIN users u_in  ON sc.incoming_user = u_in.id
    WHERE sc.session_id = ?
    ORDER BY sc.changed_at ASC
  `);

  const stmtTickets = db.prepare(`
    SELECT pt.id, pt.registered_at, pt.amount, pt.note, pt.is_voided, pt.void_reason,
           s.company_name AS supplier_name, u.name AS employee_name
    FROM purchase_tickets pt
    JOIN suppliers s ON pt.supplier_id = s.id
    JOIN users u ON pt.employee_id = u.id
    WHERE pt.session_id = ?
    ORDER BY pt.registered_at ASC
  `);

  const stmtAdditions = db.prepare(`
    SELECT ba.id, ba.added_at, ba.amount, u.name AS user_name
    FROM caja3_balance_additions ba
    JOIN users u ON ba.added_by = u.id
    WHERE ba.session_id = ?
    ORDER BY ba.added_at ASC
  `);

  const stmtShiftEnds = db.prepare(`
    SELECT se.id, se.ended_at, se.expected_balance, se.declared_balance, se.difference, u.name AS user_name
    FROM caja3_shift_ends se
    JOIN users u ON se.user_id = u.id
    WHERE se.session_id = ?
    ORDER BY se.ended_at ASC
  `);

  const result = sessions.map(session => ({
    ...session,
    shift_changes: stmtShiftChanges.all(session.id),
    tickets:       stmtTickets.all(session.id),
    additions:     stmtAdditions.all(session.id),
    shiftEnds:     stmtShiftEnds.all(session.id),
  }));

  res.json(result);
});

// GET /api/analytics/alerts?from=&to= — historial de alertas
router.get('/alerts', auth, requireAdmin, (req, res) => {
  const { from, to } = req.query;
  let query = `
    SELECT ta.*, s.company_name, u.name AS employee_name
    FROM ticket_alerts ta
    JOIN suppliers s ON ta.supplier_id = s.id
    JOIN purchase_tickets pt ON ta.ticket_id = pt.id
    JOIN users u ON pt.employee_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (from) { query += " AND date(ta.created_at, 'localtime') >= ?"; params.push(from); }
  if (to)   { query += " AND date(ta.created_at, 'localtime') <= ?"; params.push(to); }
  query += ' ORDER BY ta.created_at DESC';

  res.json(db.prepare(query).all(...params));
});

// GET /api/analytics/export?from=&to= — exportar tickets a .xlsx
router.get('/export', auth, requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Parámetros from y to son requeridos' });

  const tickets = db.prepare(`
    SELECT pt.registered_at, pt.amount, pt.note, pt.is_voided, pt.void_reason,
           s.company_name AS supplier_name, s.rep_name, s.product_type,
           u.name AS employee_name,
           ds.session_date
    FROM purchase_tickets pt
    JOIN suppliers s ON pt.supplier_id = s.id
    JOIN users u ON pt.employee_id = u.id
    JOIN daily_sessions ds ON pt.session_id = ds.id
    WHERE date(pt.registered_at, 'localtime') BETWEEN ? AND ?
    ORDER BY pt.registered_at ASC
  `).all(from, to);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tickets Proveedores');

  sheet.columns = [
    { header: 'Fecha',            key: 'session_date',   width: 14 },
    { header: 'Hora',             key: 'hora',           width: 12 },
    { header: 'Proveedor',        key: 'supplier_name',  width: 25 },
    { header: 'Representante',    key: 'rep_name',       width: 22 },
    { header: 'Tipo de producto', key: 'product_type',   width: 20 },
    { header: 'Monto',            key: 'amount',         width: 14 },
    { header: 'Nota',             key: 'note',           width: 30 },
    { header: 'Registrado por',   key: 'employee_name',  width: 22 },
    { header: 'Estado',           key: 'estado',         width: 12 },
    { header: 'Razón anulación',  key: 'void_reason',    width: 30 },
  ];

  sheet.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    cell.alignment = { horizontal: 'center' };
  });

  for (const t of tickets) {
    const date = new Date(t.registered_at);
    sheet.addRow({
      session_date:  t.session_date,
      hora:          date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      supplier_name: t.supplier_name,
      rep_name:      t.rep_name,
      product_type:  t.product_type || '—',
      amount:        t.amount,
      note:          t.note || '—',
      employee_name: t.employee_name,
      estado:        t.is_voided ? 'Anulado' : 'Válido',
      void_reason:   t.void_reason || '—',
    });
  }

  sheet.getColumn('amount').numFmt = '"$"#,##0.00';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=proveedores_${from}_${to}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
