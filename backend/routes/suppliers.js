const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const auth = require('../middleware/auth');

// GET /api/suppliers — ambos roles pueden leer el catálogo
router.get('/', auth, (req, res) => {
  const { active_only, search } = req.query;
  let query = `
    SELECT s.*, u.name AS created_by_name
    FROM suppliers s
    LEFT JOIN users u ON s.created_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (active_only !== 'false') {
    query += ' AND s.active = 1';
  }
  if (search) {
    query += ' AND (s.company_name LIKE ? OR s.product_type LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY s.company_name ASC';

  res.json(db.prepare(query).all(...params));
});

// POST /api/suppliers — solo empleados crean proveedores
router.post('/', auth, (req, res) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ error: 'Solo los empleados pueden crear proveedores' });
  }

  const { company_name, rep_name, rep_phone, product_type } = req.body;
  if (!company_name?.trim() || !rep_name?.trim()) {
    return res.status(400).json({ error: 'Nombre de empresa y representante son requeridos' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO suppliers (id, company_name, rep_name, rep_phone, product_type, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    company_name.trim(),
    rep_name.trim(),
    rep_phone?.trim() || null,
    product_type?.trim() || null,
    req.user.id
  );

  res.status(201).json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id));
});

// PUT /api/suppliers/:id — solo empleados editan
router.put('/:id', auth, (req, res) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ error: 'Solo los empleados pueden editar proveedores' });
  }

  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado' });

  const { company_name, rep_name, rep_phone, product_type, active } = req.body;

  db.prepare(`
    UPDATE suppliers SET
      company_name = COALESCE(?, company_name),
      rep_name     = COALESCE(?, rep_name),
      rep_phone    = ?,
      product_type = ?,
      active       = COALESCE(?, active),
      updated_at   = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    company_name?.trim() || null,
    rep_name?.trim() || null,
    rep_phone !== undefined ? (rep_phone?.trim() || null) : supplier.rep_phone,
    product_type !== undefined ? (product_type?.trim() || null) : supplier.product_type,
    active !== undefined ? (active ? 1 : 0) : null,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id));
});

// DELETE /api/suppliers/:id — soft delete; historial de tickets se conserva
router.delete('/:id', auth, (req, res) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ error: 'Solo los empleados pueden eliminar proveedores' });
  }

  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado' });

  db.prepare('UPDATE suppliers SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(req.params.id);

  res.json({ message: 'Proveedor eliminado correctamente' });
});

module.exports = router;
