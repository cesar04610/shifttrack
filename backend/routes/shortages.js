const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const authenticateToken = require('../middleware/auth');
const { getLocalISOString } = require('../utils/dateUtils');

const router = Router();
router.use(authenticateToken);

// GET /api/shortages — listar todos
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT ps.id, ps.name, ps.note, ps.registered_at,
           u.name AS registered_by_name
    FROM product_shortages ps
    JOIN users u ON u.id = ps.registered_by
    ORDER BY ps.registered_at DESC
  `).all();
  res.json(rows);
});

// POST /api/shortages — crear
router.post('/', (req, res) => {
  const { name, note } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre del producto es requerido' });
  }
  const id = uuidv4();
  const now = getLocalISOString();
  db.prepare(
    'INSERT INTO product_shortages (id, name, note, registered_by, registered_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name.trim(), note?.trim() || null, req.user.id, now);
  const row = db.prepare(`
    SELECT ps.id, ps.name, ps.note, ps.registered_at,
           u.name AS registered_by_name
    FROM product_shortages ps
    JOIN users u ON u.id = ps.registered_by
    WHERE ps.id = ?
  `).get(id);
  res.status(201).json(row);
});

// DELETE /api/shortages/:id — eliminar uno
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM product_shortages WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Registro no encontrado' });
  res.json({ ok: true });
});

// DELETE /api/shortages — limpiar todos
router.delete('/', (req, res) => {
  db.prepare('DELETE FROM product_shortages').run();
  res.json({ ok: true });
});

module.exports = router;
