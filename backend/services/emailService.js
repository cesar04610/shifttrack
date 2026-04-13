const nodemailer = require('nodemailer');

function getEmailConfig() {
  try {
    const db = require('../db/database');
    const row = db.prepare("SELECT * FROM email_config WHERE id = 'default'").get();
    if (row && row.active && row.user_email && row.pass) {
      return {
        host: row.host || 'smtp.gmail.com',
        port: row.port || 587,
        user: row.user_email,
        pass: row.pass,
        fromName: row.from_name || 'Mostrador Modelorama',
      };
    }
  } catch {}
  // Fallback a .env
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return {
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
      fromName: 'Mostrador Modelorama',
    };
  }
  return null;
}

function getRecipientEmails() {
  try {
    const db = require('../db/database');
    return db.prepare("SELECT email FROM email_recipients WHERE active = 1").all().map(r => r.email);
  } catch {
    return [];
  }
}

function getTransporter() {
  const config = getEmailConfig();
  if (!config) return null;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
}

async function sendAbsenceAlert({ employeeName, scheduledStart, date, adminEmail }) {
  const config = getEmailConfig();
  const transport = getTransporter();
  if (!transport) {
    console.log(`[EMAIL] Sin configuración SMTP. Alerta: ${employeeName} no fichó a las ${scheduledStart} del ${date}`);
    return false;
  }

  const recipients = adminEmail || getRecipientEmails().join(',') || process.env.ADMIN_EMAIL;
  if (!recipients) {
    console.log(`[EMAIL] Sin destinatarios para alerta de ausencia.`);
    return false;
  }

  try {
    await transport.sendMail({
      from: `"${config.fromName}" <${config.user}>`,
      to: recipients,
      subject: `⚠️ Ausencia: ${employeeName} no fichó entrada`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px;">
          <h2 style="color: #dc2626;">Alerta de Ausencia - Mostrador Modelorama</h2>
          <p>El empleado <strong>${employeeName}</strong> no ha registrado su entrada.</p>
          <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Fecha</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${date}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Turno programado</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${scheduledStart}</td></tr>
          </table>
          <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">Mostrador Modelorama — Sistema de Control de Horarios</p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error('[EMAIL] Error al enviar alerta:', err.message);
    return false;
  }
}

async function sendMail({ to, subject, html }) {
  const config = getEmailConfig();
  const transport = getTransporter();
  if (!transport) {
    console.log(`[EMAIL] Sin SMTP. Email no enviado: "${subject}"`);
    return false;
  }
  const recipients = to || getRecipientEmails().join(',') || process.env.ADMIN_EMAIL;
  if (!recipients) {
    console.log(`[EMAIL] Sin destinatarios. Email no enviado: "${subject}"`);
    return false;
  }
  try {
    await transport.sendMail({ from: `"${config.fromName}" <${config.user}>`, to: recipients, subject, html });
    return true;
  } catch (err) {
    console.error('[EMAIL] Error al enviar:', err.message);
    return false;
  }
}

module.exports = { getEmailConfig, getRecipientEmails, sendAbsenceAlert, sendMail };
