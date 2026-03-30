const { sendMail } = require('./emailService');
const db = require('../db/database');

async function sendDailySummary(date, adminEmail) {
  const instances = db.prepare(`
    SELECT ti.status, ti.completed_at, ti.note,
           c.title, c.priority,
           u.name as employee_name
    FROM task_instances ti
    JOIN task_catalog c ON ti.catalog_id = c.id
    JOIN users u ON ti.employee_id = u.id
    WHERE ti.due_date = ?
    ORDER BY u.name ASC, CASE c.priority WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END
  `).all(date);

  if (instances.length === 0) return false;

  const total = instances.length;
  const completadas = instances.filter(i => i.status === 'completada').length;
  const vencidas = instances.filter(i => i.status === 'vencida').length;
  const pendientes = instances.filter(i => i.status === 'pendiente').length;

  // Agrupar por empleado
  const byEmployee = {};
  for (const inst of instances) {
    if (!byEmployee[inst.employee_name]) byEmployee[inst.employee_name] = [];
    byEmployee[inst.employee_name].push(inst);
  }

  // Construir HTML del email
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  let employeeRows = '';
  for (const [name, tasks] of Object.entries(byEmployee)) {
    const rows = tasks.map(t => {
      const icon = t.status === 'completada' ? '✅' : '❌';
      const time = t.completed_at
        ? `— Completada a las ${new Date(t.completed_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
        : '— VENCIDA';
      return `<tr>
        <td style="padding:6px 12px">${icon}</td>
        <td style="padding:6px 12px">${t.title}</td>
        <td style="padding:6px 12px;color:#6b7280">${time}</td>
        ${t.note ? `<td style="padding:6px 12px;font-style:italic;color:#374151">"${t.note}"</td>` : '<td></td>'}
      </tr>`;
    }).join('');

    employeeRows += `
      <h3 style="margin:20px 0 8px;color:#1e40af">👤 ${name}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${rows}
      </table>`;
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#1e40af;border-bottom:2px solid #3b82f6;padding-bottom:8px">
        📋 Resumen de Tareas — ${dateLabel}
      </h2>
      <table style="border-collapse:collapse;margin-bottom:20px">
        <tr>
          <td style="padding:8px 20px 8px 0;font-size:18px;font-weight:bold">Total: ${total}</td>
          <td style="padding:8px 20px 8px 0;color:#16a34a;font-size:16px">✅ Completadas: ${completadas}</td>
          <td style="padding:8px 20px 8px 0;color:#dc2626;font-size:16px">❌ Vencidas: ${vencidas}</td>
          ${pendientes > 0 ? `<td style="padding:8px 0;color:#d97706;font-size:16px">⏳ Pendientes: ${pendientes}</td>` : ''}
        </tr>
      </table>
      <h3 style="color:#374151;margin-bottom:4px">Detalle por empleado:</h3>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:8px"/>
      ${employeeRows}
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">Mostrador Modelorama — Sistema de Control de Horarios</p>
    </div>`;

  await sendMail({
    to: adminEmail,
    subject: `[Mostrador Modelorama] Resumen de tareas — ${dateLabel}`,
    html,
  });

  return true;
}

module.exports = { sendDailySummary };
