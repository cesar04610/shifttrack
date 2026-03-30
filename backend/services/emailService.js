const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter && process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_PORT === '465',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
}

async function sendAbsenceAlert({ employeeName, scheduledStart, date, adminEmail }) {
  const transport = getTransporter();
  if (!transport) {
    console.log(`[EMAIL] Sin configuración SMTP. Alerta: ${employeeName} no fichó a las ${scheduledStart} del ${date}`);
    return false;
  }

  try {
    await transport.sendMail({
      from: `"Mostrador Modelorama" <${process.env.EMAIL_USER}>`,
      to: adminEmail || process.env.ADMIN_EMAIL,
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
  const transport = getTransporter();
  if (!transport) {
    console.log(`[EMAIL] Sin SMTP. Email no enviado: "${subject}"`);
    return false;
  }
  try {
    await transport.sendMail({ from: `"Mostrador Modelorama" <${process.env.EMAIL_USER}>`, to, subject, html });
    return true;
  } catch (err) {
    console.error('[EMAIL] Error al enviar:', err.message);
    return false;
  }
}

module.exports = { sendAbsenceAlert, sendMail };
