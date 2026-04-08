const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/role');

// GET /api/employees/list — lista básica de usuarios (cualquier usuario autenticado)
router.get('/list', auth, (req, res) => {
  const employees = db.prepare(
    "SELECT id, name FROM users WHERE role = 'employee' AND active = 1 ORDER BY name ASC"
  ).all();
  res.json(employees);
});

// GET /api/employees — lista todos los usuarios (admin)
router.get('/', auth, requireAdmin, (req, res) => {
  const employees = db.prepare(
    "SELECT id, name, role, phone, active, created_at FROM users WHERE role = 'employee' ORDER BY name ASC"
  ).all();
  res.json(employees);
});

// POST /api/employees — crear usuario (admin)
router.post('/', auth, requireAdmin, (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ error: 'Nombre y contraseña son requeridos' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (existing) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese nombre' });
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, password_hash, name, role, phone, active)
    VALUES (?, ?, ?, 'employee', ?, 1)
  `).run(id, passwordHash, name.trim(), phone || null);

  res.status(201).json({ id, name: name.trim(), role: 'employee', phone: phone || null, active: 1 });
});

// PUT /api/employees/:id — editar usuario (admin)
router.put('/:id', auth, requireAdmin, (req, res) => {
  const { name, phone, password, active } = req.body;
  const employee = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'employee'").get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Usuario no encontrado' });

  const updates = {};
  if (name !== undefined) {
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(name) = LOWER(?) AND id != ?').get(name.trim(), req.params.id);
    if (existing) return res.status(409).json({ error: 'Nombre ya en uso por otro usuario' });
    updates.name = name.trim();
  }
  if (phone !== undefined) updates.phone = phone || null;
  if (active !== undefined) updates.active = active ? 1 : 0;

  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    updates.password_hash = bcrypt.hashSync(password, 10);
  }

  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), req.params.id];
  if (fields) {
    db.prepare(`UPDATE users SET ${fields} WHERE id = ?`).run(...values);
  }

  const updated = db.prepare('SELECT id, name, role, phone, active FROM users WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/employees/:id — desactivar usuario (admin, soft delete)
router.delete('/:id', auth, requireAdmin, (req, res) => {
  const employee = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'employee'").get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Usuario no encontrado' });

  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Usuario desactivado correctamente' });
});

// DELETE /api/employees/:id/permanent — eliminar usuario permanentemente (admin)
router.delete('/:id/permanent', auth, requireAdmin, (req, res) => {
  const employee = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'employee'").get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Usuario no encontrado' });

  try {
    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    db.exec('PRAGMA foreign_keys = ON');
    res.json({ message: 'Usuario eliminado permanentemente' });
  } catch (err) {
    db.exec('PRAGMA foreign_keys = ON');
    res.status(500).json({ error: 'No se pudo eliminar el usuario' });
  }
});

module.exports = router;
