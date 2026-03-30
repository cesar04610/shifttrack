const cron = require('node-cron');
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const { sendMail } = require('../services/emailService');
const { getLocalToday } = require('../utils/dateUtils');

async function checkMissingCuts() {
  const today = getLocalToday();
  const config = db.prepare('SELECT * FROM cuts_config WHERE id = ?').get('default');
  const delayMin = config?.missing_cut_delay_min ?? 30;

  // Turnos del día con clock_in registrado, cuyo end_time + delay ya pasó
  const schedules = db.prepare(`
    SELECT s.id AS schedule_id, s.employee_id, s.end_time, s.start_time,
           u.name AS employee_name, u.email AS employee_email
    FROM schedules s
    JOIN users u ON s.employee_id = u.id
    LEFT JOIN clock_records cr ON cr.employee_id = s.employee_id
      AND cr.date = s.date
    WHERE s.date = ? AND cr.id IS NOT NULL
  `).all(today);

  const now = new Date();

  for (const sched of schedules) {
    // Calcular end_time en el día de hoy
    const endTime = new Date(`${today}T${sched.end_time}:00`);
    const deadline = new Date(endTime.getTime() + delayMin * 60 * 1000);

    if (now < deadline) continue;

    // Verificar si ya existe corte
    const hasCut = db.prepare(
      'SELECT id FROM cash_register_cuts WHERE schedule_id = ?'
    ).get(sched.schedule_id);
    if (hasCut) continue;

    // Verificar si ya se envió alerta para este turno
    const alreadySent = db.prepare(
      "SELECT id FROM cut_alert_log WHERE schedule_id = ? AND alert_type = 'missing_cut'"
    ).get(sched.schedule_id);
    if (alreadySent) continue;

    // Crear alerta
    const alertId = uuidv4();
    db.prepare(`
      INSERT INTO cut_alerts (id, alert_type, employee_id, schedule_id)
      VALUES (?, 'missing_cut', ?, ?)
    `).run(alertId, sched.employee_id, sched.schedule_id);

    db.prepare(`
      INSERT OR IGNORE INTO cut_alert_log (id, schedule_id, alert_type)
      VALUES (?, ?, 'missing_cut')
    `).run(uuidv4(), sched.schedule_id);

    // Enviar email si está habilitado
    if (config?.email_missing_cut) {
      const minutesLate = Math.round((now - endTime) / 60000);
      const dateStr = now.toLocaleDateString('es-MX', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });

      await sendMail({
        to: process.env.ADMIN_EMAIL,
        subject: `[Mostrador Modelorama] Corte de caja pendiente — ${sched.employee_name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;">
            <h2 style="color:#d97706;">⚠️ Corte de Caja Pendiente</h2>
            <p>El empleado <strong>${sched.employee_name}</strong> no ha registrado su corte de caja.</p>
            <table style="border-collapse:collapse;width:100%;margin-top:12px;">
              <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;width:45%;">Turno</td>
                  <td style="padding:8px;border:1px solid #e5e7eb;">${dateStr} | ${sched.start_time}–${sched.end_time}</td></tr>
              <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Tiempo transcurrido</td>
                  <td style="padding:8px;border:1px solid #e5e7eb;color:#dc2626;font-weight:bold;">${minutesLate} minutos desde el fin del turno</td></tr>
            </table>
            <p style="color:#6b7280;font-size:12px;margin-top:20px;">Mostrador Modelorama — Cortes de Caja</p>
          </div>
        `,
      }).catch(err => console.error('[CUTS-MISSING] Error email:', err.message));
    }

    console.log(`[CUTS-MISSING] Alerta creada para ${sched.employee_name} | turno ${sched.schedule_id}`);
  }
}

function startCutsMissingJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await checkMissingCuts();
    } catch (err) {
      console.error('[CRON cuts-missing]', err.message);
    }
  });
}

module.exports = { checkMissingCuts, startCutsMissingJob };
