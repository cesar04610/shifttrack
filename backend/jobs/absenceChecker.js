const cron = require('node-cron');
const db = require('../db/database');
const { sendAbsenceAlert } = require('../services/emailService');
const { getLocalToday } = require('../utils/dateUtils');

// Rastrear alertas ya enviadas para no duplicar
const alertsSent = new Set();

function startAbsenceChecker() {
  // Ejecutar cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const today = getLocalToday();
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM

      // Obtener configuración de tolerancia
      const configs = db.prepare("SELECT * FROM alert_config WHERE email_active = 1").all();

      for (const config of configs) {
        // Buscar turnos de hoy que ya pasaron su hora de inicio + tolerancia
        const toleranceMs = (config.tolerance_minutes || 15) * 60000;
        const adminUser = db.prepare("SELECT email FROM users WHERE id = ?").get(config.admin_id);
        if (!adminUser) continue;

        const shifts = db.prepare(`
          SELECT s.*, u.name as employee_name, u.email as employee_email
          FROM schedules s
          JOIN users u ON s.employee_id = u.id
          WHERE s.date = ? AND u.active = 1
        `).all(today);

        for (const shift of shifts) {
          const alertKey = `${shift.id}_${today}`;
          if (alertsSent.has(alertKey)) continue;

          // Calcular si la hora ya pasó + tolerancia
          const [h, m] = shift.start_time.split(':').map(Number);
          const shiftStart = new Date(`${today}T00:00:00`);
          shiftStart.setHours(h, m, 0, 0);
          const deadline = new Date(shiftStart.getTime() + toleranceMs);

          if (now < deadline) continue; // Todavía no es tiempo

          // Verificar si fichó
          const clockRecord = db.prepare(`
            SELECT id FROM clock_records
            WHERE employee_id = ? AND date = ? AND clock_in IS NOT NULL
          `).get(shift.employee_id, today);

          if (!clockRecord) {
            // Enviar alerta
            await sendAbsenceAlert({
              employeeName: shift.employee_name,
              scheduledStart: shift.start_time,
              date: today,
              adminEmail: adminUser.email,
            });
            alertsSent.add(alertKey);
            console.log(`[ALERTA] ${shift.employee_name} no fichó a las ${shift.start_time} — alerta enviada`);
          }
        }
      }

      // Limpiar alertas del día anterior
      if (now.getHours() === 0 && now.getMinutes() < 5) {
        alertsSent.clear();
      }
    } catch (err) {
      console.error('[CRON] Error en verificación de ausencias:', err.message);
    }
  });

  console.log('[CRON] Verificador de ausencias iniciado (cada 5 min)');
}

module.exports = { startAbsenceChecker };
