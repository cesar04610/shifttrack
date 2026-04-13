const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const db = require('../db/database');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/role');

// ─── GET /api/alerts/email-config ────────────────────────────────────────────
router.get('/email-config', auth, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT * FROM email_config WHERE id = 'default'").get();
  if (!row) return res.json({ host: 'smtp.gmail.com', port: 587, user_email: '', pass_set: false, from_name: 'Mostrador Modelorama', active: 0 });
  res.json({
    host: row.host,
    port: row.port,
    user_email: row.user_email || '',
    pass_set: !!(row.pass),
    from_name: row.from_name,
    active: row.active,
    updated_at: row.updated_at,
  });
});

// ─── PUT /api/alerts/email-config ────────────────────────────────────────────
router.put('/email-config', auth, requireAdmin, (req, res) => {
  const { host, port, user_email, pass, from_name, active } = req.body;
  const passToStore = (pass && pass.trim()) ? pass.trim() : null;

  db.prepare(`
    UPDATE email_config
    SET host = ?, port = ?, user_email = ?,
        pass = CASE WHEN ? IS NOT NULL THEN ? ELSE pass END,
        from_name = ?, active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 'default'
  `).run(
    host || 'smtp.gmail.com',
    parseInt(port) || 587,
    user_email || null,
    passToStore, passToStore,
    from_name || 'Mostrador Modelorama',
    active ? 1 : 0
  );

  res.json({ message: 'Configuración guardada' });
});

// ─── POST /api/alerts/email-config/test ──────────────────────────────────────
router.post('/email-config/test', auth, requireAdmin, async (req, res) => {
  const row = db.prepare("SELECT * FROM email_config WHERE id = 'default'").get();
  if (!row || !row.user_email || !row.pass) {
    return res.status(400).json({ error: 'Configura el correo y la contraseña antes de probar.' });
  }

  // Destinatario: primera cuenta activa o el mismo remitente
  const recipientRow = db.prepare("SELECT email FROM email_recipients WHERE active = 1 LIMIT 1").get();
  const testTo = recipientRow ? recipientRow.email : row.user_email;

  try {
    const transport = nodemailer.createTransport({
      host: row.host || 'smtp.gmail.com',
      port: row.port || 587,
      secure: (row.port || 587) === 465,
      auth: { user: row.user_email, pass: row.pass },
    });

    await transport.sendMail({
      from: `"${row.from_name || 'Mostrador Modelorama'}" <${row.user_email}>`,
      to: testTo,
      subject: '✅ Prueba de conexión — Mostrador Modelorama',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;">
          <h2 style="color:#059669;">✅ Configuración de correo correcta</h2>
          <p>Este es un correo de prueba enviado desde el sistema <strong>Mostrador Modelorama</strong>.</p>
          <p style="color:#6b7280;font-size:12px;">Si recibiste este mensaje, la configuración SMTP es válida.</p>
        </div>
      `,
    });

    res.json({ message: `Correo de prueba enviado a ${testTo}` });
  } catch (err) {
    res.status(500).json({ error: `Error al enviar: ${err.message}` });
  }
});

// ─── GET /api/alerts/recipients ──────────────────────────────────────────────
router.get('/recipients', auth, requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM email_recipients ORDER BY created_at ASC").all();
  res.json(rows);
});

// ─── POST /api/alerts/recipients ─────────────────────────────────────────────
router.post('/recipients', auth, requireAdmin, (req, res) => {
  const { email, name } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  const id = uuidv4();
  try {
    db.prepare("INSERT INTO email_recipients (id, email, name) VALUES (?, ?, ?)").run(id, email.trim().toLowerCase(), name?.trim() || null);
    const row = db.prepare("SELECT * FROM email_recipients WHERE id = ?").get(id);
    res.status(201).json(row);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Este correo ya está registrado' });
    }
    res.status(500).json({ error: 'Error al guardar destinatario' });
  }
});

// ─── PATCH /api/alerts/recipients/:id ────────────────────────────────────────
router.patch('/recipients/:id', auth, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT * FROM email_recipients WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Destinatario no encontrado' });
  db.prepare("UPDATE email_recipients SET active = ? WHERE id = ?").run(row.active ? 0 : 1, row.id);
  res.json({ message: 'Estado actualizado' });
});

// ─── DELETE /api/alerts/recipients/:id ───────────────────────────────────────
router.delete('/recipients/:id', auth, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT id FROM email_recipients WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Destinatario no encontrado' });
  db.prepare("DELETE FROM email_recipients WHERE id = ?").run(req.params.id);
  res.json({ message: 'Destinatario eliminado' });
});

module.exports = router;
