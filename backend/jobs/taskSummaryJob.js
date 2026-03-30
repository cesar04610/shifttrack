const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { sendDailySummary } = require('../services/taskSummaryService');
const { getLocalToday } = require('../utils/dateUtils');

function startTaskSummaryJob() {
  // Ejecutar cada 5 minutos (comparte intervalo con absenceChecker)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const today = getLocalToday();
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM

      // Verificar si ya se envió el resumen hoy
      const alreadySent = db.prepare('SELECT id FROM task_summary_log WHERE summary_date = ?').get(today);
      if (alreadySent) return;

      // Obtener el turno más tardío del día
      const lastShift = db.prepare('SELECT MAX(end_time) as last_end FROM schedules WHERE date = ?').get(today);
      if (!lastShift?.last_end) return;

      // Si ya pasó la hora del último turno, enviar resumen
      if (currentTime < lastShift.last_end) return;

      // Marcar como vencidas las instancias pendientes
      db.prepare("UPDATE task_instances SET status = 'vencida' WHERE due_date = ? AND status = 'pendiente'").run(today);

      // Obtener email del admin
      const adminUser = db.prepare("SELECT email FROM users WHERE role = 'admin' LIMIT 1").get();
      const adminEmail = process.env.ADMIN_EMAIL || adminUser?.email;
      if (!adminEmail) return;

      // Enviar resumen
      const sent = await sendDailySummary(today, adminEmail);

      // Registrar en log para evitar duplicados
      db.prepare('INSERT INTO task_summary_log (id, summary_date) VALUES (?, ?)').run(uuidv4(), today);

      if (sent) console.log(`[TASK-SUMMARY] Resumen del día ${today} enviado a ${adminEmail}`);
    } catch (err) {
      console.error('[TASK-SUMMARY] Error:', err.message);
    }
  });

  console.log('[CRON] Job de resumen de tareas iniciado (cada 5 min)');
}

module.exports = { startTaskSummaryJob };
