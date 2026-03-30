const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('../db/database');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/role');
const { getLocalToday } = require('../utils/dateUtils');

// ─── Multer: fotos de evidencia ──────────────────────────────────────────────

const uploadsDir = process.env.UPLOADS_PATH
  ? path.resolve(process.env.UPLOADS_PATH)
  : path.join(__dirname, '..', 'uploads', 'tasks');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${getLocalToday()}-${uuidv4()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE TAREAS — plantillas reutilizables, sin empleado asignado
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/tasks/catalog
router.get('/catalog', auth, requireAdmin, (req, res) => {
  const items = db.prepare(`
    SELECT c.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM task_assignments a WHERE a.catalog_id = c.id AND a.is_active = 1) as active_assignments
    FROM task_catalog c
    JOIN users u ON c.created_by = u.id
    ORDER BY c.title ASC
  `).all();
  res.json(items);
});

// POST /api/tasks/catalog
router.post('/catalog', auth, requireAdmin, (req, res) => {
  const { title, description, priority } = req.body;
  if (!title) return res.status(400).json({ error: 'El título es requerido' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO task_catalog (id, title, description, priority, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, title.trim(), description?.trim() || null, priority || 'media', req.user.id);

  const item = db.prepare('SELECT * FROM task_catalog WHERE id = ?').get(id);
  res.status(201).json(item);
});

// PUT /api/tasks/catalog/:id
router.put('/catalog/:id', auth, requireAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM task_catalog WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Tarea no encontrada en catálogo' });

  const { title, description, priority } = req.body;
  db.prepare(`
    UPDATE task_catalog SET title = COALESCE(?, title), description = ?, priority = COALESCE(?, priority)
    WHERE id = ?
  `).run(title?.trim() || null, description !== undefined ? (description?.trim() || null) : item.description,
    priority || null, req.params.id);

  res.json(db.prepare('SELECT * FROM task_catalog WHERE id = ?').get(req.params.id));
});

// DELETE /api/tasks/catalog/:id
router.delete('/catalog/:id', auth, requireAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM task_catalog WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Tarea no encontrada' });

  const assignments = db.prepare('SELECT COUNT(*) as n FROM task_assignments WHERE catalog_id = ?').get(req.params.id);
  if (assignments.n > 0) {
    return res.status(409).json({ error: 'No se puede eliminar: la tarea tiene asignaciones activas. Elimina primero las asignaciones.' });
  }

  db.prepare('DELETE FROM task_catalog WHERE id = ?').run(req.params.id);
  res.json({ message: 'Tarea eliminada del catálogo' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ASIGNACIONES — vincula catálogo + empleado + recurrencia
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/tasks/assignments?employee_id=&date=
router.get('/assignments', auth, requireAdmin, (req, res) => {
  let query = `
    SELECT a.*, c.title, c.description, c.priority,
           u.name as employee_name, u.email as employee_email
    FROM task_assignments a
    JOIN task_catalog c ON a.catalog_id = c.id
    JOIN users u ON a.employee_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (req.query.employee_id) { query += ' AND a.employee_id = ?'; params.push(req.query.employee_id); }
  if (req.query.active_only !== 'false') { query += ' AND a.is_active = 1'; }
  query += ' ORDER BY u.name ASC, c.title ASC';

  const assignments = db.prepare(query).all(...params);
  res.json(assignments.map(a => ({ ...a, recurrence_days: a.recurrence_days ? JSON.parse(a.recurrence_days) : [] })));
});

// POST /api/tasks/assignments  — crear asignación
router.post('/assignments', auth, requireAdmin, (req, res) => {
  const { catalog_id, employee_id, recurrence_type, recurrence_days, start_date } = req.body;
  if (!catalog_id || !employee_id || !recurrence_type || !start_date) {
    return res.status(400).json({ error: 'catalog_id, employee_id, recurrence_type y start_date son requeridos' });
  }

  const catalog = db.prepare('SELECT id FROM task_catalog WHERE id = ?').get(catalog_id);
  if (!catalog) return res.status(404).json({ error: 'Tarea no encontrada en catálogo' });

  const employee = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'employee' AND active = 1").get(employee_id);
  if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO task_assignments (id, catalog_id, employee_id, recurrence_type, recurrence_days, start_date, is_active, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, catalog_id, employee_id, recurrence_type,
    recurrence_days?.length ? JSON.stringify(recurrence_days) : null, start_date, req.user.id);

  // Si la asignación aplica para hoy, generar instancia inmediatamente
  const today = getLocalToday();
  if (shouldGenerateOnDate({ recurrence_type, recurrence_days, start_date }, today)) {
    createInstanceIfNotExists(id, catalog_id, employee_id, today);
  }

  const created = db.prepare(`
    SELECT a.*, c.title, c.priority, u.name as employee_name
    FROM task_assignments a
    JOIN task_catalog c ON a.catalog_id = c.id
    JOIN users u ON a.employee_id = u.id
    WHERE a.id = ?
  `).get(id);

  res.status(201).json({ ...created, recurrence_days: created.recurrence_days ? JSON.parse(created.recurrence_days) : [] });
});

// PUT /api/tasks/assignments/:id  — editar asignación
router.put('/assignments/:id', auth, requireAdmin, (req, res) => {
  const asgn = db.prepare('SELECT * FROM task_assignments WHERE id = ?').get(req.params.id);
  if (!asgn) return res.status(404).json({ error: 'Asignación no encontrada' });

  const { recurrence_type, recurrence_days, start_date, is_active } = req.body;
  db.prepare(`
    UPDATE task_assignments SET
      recurrence_type = COALESCE(?, recurrence_type),
      recurrence_days = ?,
      start_date = COALESCE(?, start_date),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(recurrence_type || null,
    recurrence_days !== undefined ? (recurrence_days?.length ? JSON.stringify(recurrence_days) : null) : asgn.recurrence_days,
    start_date || null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    req.params.id);

  res.json({ message: 'Asignación actualizada' });
});

// DELETE /api/tasks/assignments/:id  — eliminar asignación (instancias completadas se conservan)
router.delete('/assignments/:id', auth, requireAdmin, (req, res) => {
  const asgn = db.prepare('SELECT * FROM task_assignments WHERE id = ?').get(req.params.id);
  if (!asgn) return res.status(404).json({ error: 'Asignación no encontrada' });

  db.prepare("DELETE FROM task_instances WHERE assignment_id = ? AND status = 'pendiente'").run(req.params.id);
  db.prepare('DELETE FROM task_assignments WHERE id = ?').run(req.params.id);
  res.json({ message: 'Asignación eliminada' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: empleados con turno en una fecha
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/tasks/employees-by-date?date=YYYY-MM-DD
router.get('/employees-by-date', auth, requireAdmin, (req, res) => {
  const date = req.query.date || getLocalToday();

  // Todos los empleados activos
  const allEmployees = db.prepare(
    "SELECT id, name, email FROM users WHERE role = 'employee' AND active = 1 ORDER BY name ASC"
  ).all();

  // IDs con turno programado en esa fecha
  const scheduledIds = new Set(
    db.prepare("SELECT DISTINCT employee_id FROM schedules WHERE date = ?").all(date).map(r => r.employee_id)
  );

  // Marcar cuáles tienen turno ese día
  const result = allEmployees.map(e => ({
    ...e,
    has_schedule: scheduledIds.has(e.id),
  }));

  // Primero los que trabajan ese día, luego los demás
  result.sort((a, b) => (b.has_schedule ? 1 : 0) - (a.has_schedule ? 1 : 0) || a.name.localeCompare(b.name));
  res.json(result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// INSTANCIAS DEL DÍA
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/tasks/instances?date=&employee_id=&status=
router.get('/instances', auth, requireAdmin, (req, res) => {
  const date = req.query.date || getLocalToday();
  let query = `
    SELECT ti.*, c.title, c.priority, c.description, u.name as employee_name
    FROM task_instances ti
    JOIN task_catalog c ON ti.catalog_id = c.id
    JOIN users u ON ti.employee_id = u.id
    WHERE ti.due_date = ?
  `;
  const params = [date];

  if (req.query.employee_id) { query += ' AND ti.employee_id = ?'; params.push(req.query.employee_id); }
  if (req.query.status) { query += ' AND ti.status = ?'; params.push(req.query.status); }
  query += " ORDER BY CASE c.priority WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, u.name ASC";

  res.json(db.prepare(query).all(...params));
});

// PUT /api/tasks/instances/:id/revert  — admin revierte a pendiente
router.put('/instances/:id/revert', auth, requireAdmin, (req, res) => {
  const inst = db.prepare('SELECT * FROM task_instances WHERE id = ?').get(req.params.id);
  if (!inst) return res.status(404).json({ error: 'Instancia no encontrada' });

  if (inst.photo_path) {
    const fullPath = path.join(uploadsDir, path.basename(inst.photo_path));
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  db.prepare("UPDATE task_instances SET status = 'pendiente', completed_at = NULL, note = NULL, photo_path = NULL WHERE id = ?").run(req.params.id);
  res.json({ message: 'Tarea revertida a pendiente' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VISTA EMPLEADO
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/tasks/my-tasks
router.get('/my-tasks', auth, (req, res) => {
  const today = getLocalToday();
  const instances = db.prepare(`
    SELECT ti.*, c.title, c.priority, c.description
    FROM task_instances ti
    JOIN task_catalog c ON ti.catalog_id = c.id
    WHERE ti.employee_id = ? AND ti.due_date = ?
    ORDER BY CASE c.priority WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, ti.created_at ASC
  `).all(req.user.id, today);
  res.json(instances);
});

// POST /api/tasks/instances/:id/complete  — empleado completa tarea con evidencia
router.post('/instances/:id/complete', auth, upload.single('photo'), (req, res) => {
  const inst = db.prepare('SELECT * FROM task_instances WHERE id = ?').get(req.params.id);
  if (!inst) return res.status(404).json({ error: 'Tarea no encontrada' });
  if (inst.employee_id !== req.user.id) return res.status(403).json({ error: 'No puedes completar tareas de otros empleados' });
  if (inst.status === 'completada') return res.status(409).json({ error: 'Esta tarea ya fue completada' });

  const note = req.body.note || null;
  const photoPath = req.file ? `/uploads/tasks/${req.file.filename}` : null;

  db.prepare(`
    UPDATE task_instances SET status = 'completada', completed_at = ?, note = ?, photo_path = ? WHERE id = ?
  `).run(new Date().toISOString(), note, photoPath, req.params.id);

  res.json(db.prepare('SELECT * FROM task_instances WHERE id = ?').get(req.params.id));
});

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTE EXPORTABLE
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/report', auth, requireAdmin, async (req, res) => {
  const { from, to, employee_id } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Fechas from y to requeridas' });

  let query = `
    SELECT ti.due_date, ti.status, ti.completed_at, ti.note,
           c.title, c.priority,
           u.name as employee_name
    FROM task_instances ti
    JOIN task_catalog c ON ti.catalog_id = c.id
    JOIN users u ON ti.employee_id = u.id
    WHERE ti.due_date BETWEEN ? AND ?
  `;
  const params = [from, to];
  if (employee_id) { query += ' AND ti.employee_id = ?'; params.push(employee_id); }
  query += ' ORDER BY u.name ASC, ti.due_date ASC';

  const records = db.prepare(query).all(...params);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tareas');

  sheet.columns = [
    { header: 'Empleado', key: 'employee_name', width: 22 },
    { header: 'Fecha', key: 'due_date', width: 14 },
    { header: 'Tarea', key: 'title', width: 30 },
    { header: 'Prioridad', key: 'priority', width: 12 },
    { header: 'Estado', key: 'status', width: 14 },
    { header: 'Completada a las', key: 'completed_at', width: 22 },
    { header: 'Nota', key: 'note', width: 30 },
  ];
  sheet.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    cell.alignment = { horizontal: 'center' };
  });
  records.forEach(r => sheet.addRow({
    ...r,
    completed_at: r.completed_at ? new Date(r.completed_at).toLocaleString('es-MX') : '—',
    note: r.note || '—',
  }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=tareas_${from}_${to}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

// ─── Helpers exportados para el generador de tareas ──────────────────────────

function shouldGenerateOnDate(assignment, dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const startD = new Date(assignment.start_date + 'T00:00:00');
  if (d < startD) return false;

  if (assignment.recurrence_type === 'única') return dateStr === assignment.start_date;
  if (assignment.recurrence_type === 'diaria') return true;
  if (assignment.recurrence_type === 'semanal') {
    const days = Array.isArray(assignment.recurrence_days)
      ? assignment.recurrence_days
      : (assignment.recurrence_days ? JSON.parse(assignment.recurrence_days) : []);
    const jsDay = d.getDay(); // 0=Dom...6=Sab
    const docDay = jsDay === 0 ? 7 : jsDay; // 1=Lun...7=Dom
    return days.includes(docDay);
  }
  return false;
}

function createInstanceIfNotExists(assignmentId, catalogId, employeeId, dateStr) {
  const exists = db.prepare('SELECT id FROM task_instances WHERE assignment_id = ? AND due_date = ?').get(assignmentId, dateStr);
  if (!exists) {
    db.prepare(`
      INSERT INTO task_instances (id, assignment_id, catalog_id, employee_id, due_date)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), assignmentId, catalogId, employeeId, dateStr);
  }
}

module.exports = router;
module.exports.shouldGenerateOnDate = shouldGenerateOnDate;
module.exports.createInstanceIfNotExists = createInstanceIfNotExists;
