const cron = require('node-cron');
const db = require('../db/database');
const { shouldGenerateOnDate, createInstanceIfNotExists } = require('../routes/tasks');
const { getLocalToday } = require('../utils/dateUtils');

function startTaskGenerator() {
  // Ejecutar a las 00:01 AM cada día (hora local gracias a TZ)
  cron.schedule('1 0 * * *', () => generateInstancesForDate(getLocalToday()));

  // Al iniciar el servidor, generar instancias del día actual
  generateInstancesForDate(getLocalToday());

  console.log('[CRON] Generador de tareas iniciado (00:01 diario)');
}

function generateInstancesForDate(dateStr) {
  try {
    const activeAssignments = db.prepare('SELECT * FROM task_assignments WHERE is_active = 1').all();
    let generated = 0;

    for (const asgn of activeAssignments) {
      if (shouldGenerateOnDate(asgn, dateStr)) {
        createInstanceIfNotExists(asgn.id, asgn.catalog_id, asgn.employee_id, dateStr);
        generated++;
      }
    }

    if (generated > 0) console.log(`[TASK-GEN] ${generated} instancia(s) generada(s) para ${dateStr}`);
  } catch (err) {
    console.error('[TASK-GEN] Error:', err.message);
  }
}

module.exports = { startTaskGenerator, generateInstancesForDate };
