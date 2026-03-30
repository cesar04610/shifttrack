const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const { sendMail } = require('./emailService');

const DAY_NAMES_ES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// isoDay: 1=Lun ... 7=Dom
function getIsoDay(date) {
  const jsDay = date.getDay(); // 0=Dom ... 6=Sab
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Verifica si un ticket recién registrado supera en >20% el promedio histórico
 * del proveedor para ese día de semana. Requiere al menos 3 tickets previos.
 * Inserta en ticket_alerts y envía email al admin si aplica.
 * Retorna el objeto de alerta o null si no hay alerta.
 */
async function checkTicketAlert(supplierId, ticketId, ticketAmount) {
  const now = new Date();
  const isoDay = getIsoDay(now);

  // Promedio histórico (excluye el ticket recién creado, excluye anulados)
  const avgRow = db.prepare(`
    SELECT AVG(pt.amount) AS historical_avg, COUNT(*) AS ticket_count
    FROM purchase_tickets pt
    WHERE pt.supplier_id = ?
      AND CASE WHEN strftime('%w', pt.registered_at, 'localtime') = '0' THEN 7
               ELSE CAST(strftime('%w', pt.registered_at, 'localtime') AS INTEGER) END = ?
      AND pt.is_voided = 0
      AND pt.id != ?
  `).get(supplierId, isoDay, ticketId);

  // Mínimo 3 tickets históricos para ese día de semana
  if (!avgRow || avgRow.ticket_count < 3 || !avgRow.historical_avg) return null;

  const historical_avg = avgRow.historical_avg;
  const deviation_pct = ((ticketAmount - historical_avg) / historical_avg) * 100;

  if (deviation_pct <= 20) return null;

  // Obtener datos del proveedor y del ticket/empleado
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
  const ticket = db.prepare(`
    SELECT pt.*, u.name AS employee_name
    FROM purchase_tickets pt
    JOIN users u ON pt.employee_id = u.id
    WHERE pt.id = ?
  `).get(ticketId);

  // Registrar alerta
  const alertId = uuidv4();
  db.prepare(`
    INSERT INTO ticket_alerts (id, ticket_id, supplier_id, day_of_week, historical_avg, ticket_amount, deviation_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(alertId, ticketId, supplierId, isoDay, historical_avg, ticketAmount, parseFloat(deviation_pct.toFixed(2)));

  // Enviar email
  const dayName = DAY_NAMES_ES[isoDay];
  const dateStr = now.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const emailSent = await sendMail({
    to: process.env.ADMIN_EMAIL,
    subject: `[Mostrador Modelorama] ⚠️ Ticket inusual — ${supplier.company_name} | ${dayName} ${now.toLocaleDateString('es-MX')}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;">
        <h2 style="color:#d97706;">⚠️ Ticket Inusual Detectado</h2>
        <p>Se registró un ticket que supera el promedio esperado para este día.</p>
        <table style="border-collapse:collapse;width:100%;margin-top:12px;">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;width:45%;">Proveedor</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${supplier.company_name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Representante</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${supplier.rep_name}${supplier.rep_phone ? ' &nbsp;|&nbsp; Tel: ' + supplier.rep_phone : ''}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Monto del ticket</td>
              <td style="padding:8px;border:1px solid #e5e7eb;color:#dc2626;font-weight:bold;">$${ticketAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Promedio histórico (${dayName})</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">$${historical_avg.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Desviación</td>
              <td style="padding:8px;border:1px solid #e5e7eb;color:#dc2626;font-weight:bold;">+${deviation_pct.toFixed(1)}%</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Registrado por</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${ticket.employee_name} &nbsp;|&nbsp; ${dateStr} a las ${timeStr}</td></tr>
        </table>
        <p style="color:#6b7280;font-size:12px;margin-top:20px;">Mostrador Modelorama — Módulo de Compra de Proveedores</p>
      </div>
    `,
  });

  if (emailSent) {
    db.prepare('UPDATE ticket_alerts SET email_sent = 1 WHERE id = ?').run(alertId);
  }

  return {
    historical_avg: parseFloat(historical_avg.toFixed(2)),
    deviation_pct: parseFloat(deviation_pct.toFixed(1)),
    day_name: dayName,
  };
}

module.exports = { checkTicketAlert };
