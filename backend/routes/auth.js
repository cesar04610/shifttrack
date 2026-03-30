const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const auth = require('../middleware/auth');

// POST /api/auth/login — login por nombre de usuario + contraseña
router.post('/login', (req, res) => {
  const { name, password, caja } = req.body;
  if (!name || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const user = db.prepare('SELECT * FROM users WHERE LOWER(name) = LOWER(?) AND active = 1').get(name.trim());
  if (!user) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  // Para usuarios normales, caja es obligatoria
  const userCaja = user.role === 'admin' ? null : (caja || null);

  // ─── Bloqueo de Caja 3: solo un usuario a la vez ───────────────────────
  if (userCaja === 3) {
    // Limpiar locks expirados
    db.prepare("DELETE FROM caja_locks WHERE expires_at < datetime('now', 'localtime')").run();

    // Verificar si caja 3 está ocupada por otro usuario
    const lock = db.prepare('SELECT * FROM caja_locks WHERE caja = 3').get();
    if (lock && lock.user_id !== user.id) {
      return res.status(409).json({
        error: `La Caja 3 está ocupada por ${lock.user_name}. Solo un usuario puede usar la Caja 3 a la vez.`
      });
    }

    // Registrar lock para caja 3
    db.prepare(`
      INSERT OR REPLACE INTO caja_locks (caja, user_id, user_name, locked_at, expires_at)
      VALUES (3, ?, ?, datetime('now','localtime'), datetime('now','localtime','+8 hours'))
    `).run(user.id, user.name);
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name, caja: userCaja },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: { id: user.id, role: user.role, name: user.name, caja: userCaja }
  });
});

// POST /api/auth/logout — liberar lock de caja 3 si aplica
router.post('/logout', auth, (req, res) => {
  if (req.user.caja === 3) {
    db.prepare('DELETE FROM caja_locks WHERE caja = 3 AND user_id = ?').run(req.user.id);
  }
  res.json({ message: 'Sesión cerrada' });
});

// POST /api/auth/change-password (usuario autenticado cambia su propia contraseña)
router.post('/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const valid = bcrypt.compareSync(currentPassword, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
  res.json({ message: 'Contraseña actualizada correctamente' });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, name, role, phone, active FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(user);
});

module.exports = router;
