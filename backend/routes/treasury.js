const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/role');
const ExcelJS = require('exceljs');
const { getLocalToday, getLocalISOString } = require('../utils/dateUtils');
const treasury = require('../services/treasuryCalculator');

// ── Todas las rutas requieren admin ──────────────────────────────────────────
router.use(auth, requireAdmin);

// ── GET /summary — indicadores principales ───────────────────────────────────
router.get('/summary', (req, res) => {
  try {
    const date = req.query.date || getLocalToday();
    const summary = treasury.getDailySummary(date);
    res.json(summary);
  } catch (err) {
    console.error('[TREASURY] Error en summary:', err.message);
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
});

// ── POST /initial-cash — registrar efectivo inicial ──────────────────────────
router.post('/initial-cash', (req, res) => {
  try {
    const { amount } = req.body;
    if (amount == null || amount < 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }

    const today = getLocalToday();

    // Verificar si ya existe initial_cash para hoy
    const existing = db.prepare(`
      SELECT id FROM treasury_movements
      WHERE date = ? AND movement_type = 'initial_cash' AND is_deleted = 0
    `).get(today);

    if (existing) {
      return res.status(409).json({ error: 'Ya existe un efectivo inicial para hoy' });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO treasury_movements (id, date, movement_type, amount, description, created_by, created_at)
      VALUES (?, ?, 'initial_cash', ?, 'Efectivo inicial', ?, ?)
    `).run(id, today, amount, req.user.id, getLocalISOString());

    res.status(201).json({ id, date: today, amount, movement_type: 'initial_cash' });
  } catch (err) {
    console.error('[TREASURY] Error en initial-cash:', err.message);
    res.status(500).json({ error: 'Error al registrar efectivo inicial' });
  }
});

// ── POST /adjustment — ajuste de efectivo ────────────────────────────────────
router.post('/adjustment', (req, res) => {
  try {
    const { declared_amount } = req.body;
    if (declared_amount == null || declared_amount < 0) {
      return res.status(400).json({ error: 'Monto declarado inválido' });
    }

    const today = getLocalToday();
    const expectedCash = treasury.getExpectedCash(today);
    const difference = declared_amount - expectedCash;

    const id = uuidv4();
    db.prepare(`
      INSERT INTO treasury_movements (id, date, movement_type, amount, description, expected_before, declared_amount, created_by, created_at)
      VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, ?)
    `).run(id, today, difference, `Ajuste de efectivo`, expectedCash, declared_amount, req.user.id, getLocalISOString());

    res.status(201).json({
      id,
      date: today,
      movement_type: 'adjustment',
      amount: difference,
      expected_before: expectedCash,
      declared_amount,
      new_cash: declared_amount,
    });
  } catch (err) {
    console.error('[TREASURY] Error en adjustment:', err.message);
    res.status(500).json({ error: 'Error al registrar ajuste' });
  }
});

// ── POST /expense — registrar gasto ──────────────────────────────────────────
router.post('/expense', (req, res) => {
  try {
    const { amount, description, category_id } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }
    if (!category_id) {
      return res.status(400).json({ error: 'Categoría requerida' });
    }

    // Verificar que la categoría existe y está activa
    const cat = db.prepare('SELECT id FROM expense_categories WHERE id = ? AND is_active = 1').get(category_id);
    if (!cat) {
      return res.status(400).json({ error: 'Categoría no válida' });
    }

    const id = uuidv4();
    const today = getLocalToday();
    db.prepare(`
      INSERT INTO treasury_movements (id, date, movement_type, amount, description, category_id, created_by, created_at)
      VALUES (?, ?, 'expense', ?, ?, ?, ?, ?)
    `).run(id, today, amount, description || '', category_id, req.user.id, getLocalISOString());

    res.status(201).json({ id, date: today, movement_type: 'expense', amount, description, category_id });
  } catch (err) {
    console.error('[TREASURY] Error en expense:', err.message);
    res.status(500).json({ error: 'Error al registrar gasto' });
  }
});

// ── DELETE /expense/:id — soft delete de gasto (solo mismo día) ──────────────
router.delete('/expense/:id', (req, res) => {
  try {
    const movement = db.prepare(`
      SELECT * FROM treasury_movements WHERE id = ? AND movement_type = 'expense' AND is_deleted = 0
    `).get(req.params.id);

    if (!movement) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }
    if (movement.date !== getLocalToday()) {
      return res.status(403).json({ error: 'Solo se pueden eliminar gastos del día actual' });
    }

    db.prepare(`
      UPDATE treasury_movements SET is_deleted = 1, deleted_at = ? WHERE id = ?
    `).run(getLocalISOString(), req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('[TREASURY] Error eliminando gasto:', err.message);
    res.status(500).json({ error: 'Error al eliminar gasto' });
  }
});

// ── POST /bank-withdrawal — retiro de banco ─────────────────────────────────
router.post('/bank-withdrawal', (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }

    const id = uuidv4();
    const today = getLocalToday();
    db.prepare(`
      INSERT INTO treasury_movements (id, date, movement_type, amount, description, created_by, created_at)
      VALUES (?, ?, 'bank_withdrawal', ?, ?, ?, ?)
    `).run(id, today, amount, description || '', req.user.id, getLocalISOString());

    res.status(201).json({ id, date: today, movement_type: 'bank_withdrawal', amount, description });
  } catch (err) {
    console.error('[TREASURY] Error en bank-withdrawal:', err.message);
    res.status(500).json({ error: 'Error al registrar retiro' });
  }
});

// ── DELETE /bank-withdrawal/:id — soft delete de retiro (solo mismo día) ─────
router.delete('/bank-withdrawal/:id', (req, res) => {
  try {
    const movement = db.prepare(`
      SELECT * FROM treasury_movements WHERE id = ? AND movement_type = 'bank_withdrawal' AND is_deleted = 0
    `).get(req.params.id);

    if (!movement) {
      return res.status(404).json({ error: 'Retiro no encontrado' });
    }
    if (movement.date !== getLocalToday()) {
      return res.status(403).json({ error: 'Solo se pueden eliminar retiros del día actual' });
    }

    db.prepare(`
      UPDATE treasury_movements SET is_deleted = 1, deleted_at = ? WHERE id = ?
    `).run(getLocalISOString(), req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('[TREASURY] Error eliminando retiro:', err.message);
    res.status(500).json({ error: 'Error al eliminar retiro' });
  }
});

// ── GET /movements — lista de movimientos con filtros ────────────────────────
router.get('/movements', (req, res) => {
  try {
    const today = getLocalToday();
    const from = req.query.from || today;
    const to = req.query.to || today;
    const filters = {};
    if (req.query.type) filters.type = req.query.type;
    if (req.query.category_id) filters.category_id = req.query.category_id;

    const movements = treasury.getMovementsByRange(from, to, filters);
    res.json(movements);
  } catch (err) {
    console.error('[TREASURY] Error en movements:', err.message);
    res.status(500).json({ error: 'Error al obtener movimientos' });
  }
});

// ── GET /history — historial de saldos diarios ──────────────────────────────
router.get('/history', (req, res) => {
  try {
    const today = getLocalToday();
    // Por defecto últimos 7 días
    const to = req.query.to || today;
    const from = req.query.from || (() => {
      const d = new Date(to + 'T00:00:00');
      d.setDate(d.getDate() - 6);
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    })();

    const history = treasury.getHistoryRange(from, to);
    res.json({ from, to, days: history });
  } catch (err) {
    console.error('[TREASURY] Error en history:', err.message);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// ── GET /export — exportar historial a xlsx ──────────────────────────────────
router.get('/export', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Parámetros from y to son requeridos' });

    const history = treasury.getHistoryRange(from, to);
    const movements = treasury.getMovementsByRange(from, to);

    const workbook = new ExcelJS.Workbook();

    // Hoja 1: Resumen diario
    const summarySheet = workbook.addWorksheet('Resumen Diario');
    summarySheet.columns = [
      { header: 'Fecha',            key: 'date',    width: 13 },
      { header: 'Efectivo',         key: 'cash',    width: 16 },
      { header: 'Saldo en Banco',   key: 'bank',    width: 16 },
      { header: 'Total del Negocio', key: 'total',  width: 18 },
      { header: 'Movimientos',      key: 'movs',    width: 14 },
      { header: 'Cortes',           key: 'cuts',    width: 10 },
    ];

    summarySheet.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center' };
    });

    for (const day of history) {
      summarySheet.addRow({
        date: day.date,
        cash: day.cash,
        bank: day.bank,
        total: day.total,
        movs: day.movementCount,
        cuts: day.cutCount,
      });
    }

    ['cash', 'bank', 'total'].forEach(k => {
      summarySheet.getColumn(k).numFmt = '"$"#,##0.00';
    });

    // Hoja 2: Detalle de movimientos
    const movSheet = workbook.addWorksheet('Movimientos');
    movSheet.columns = [
      { header: 'Fecha',       key: 'date',        width: 13 },
      { header: 'Hora',        key: 'time',        width: 10 },
      { header: 'Tipo',        key: 'type',        width: 18 },
      { header: 'Monto',       key: 'amount',      width: 16 },
      { header: 'Descripción', key: 'description', width: 30 },
      { header: 'Categoría',   key: 'category',    width: 16 },
      { header: 'Registrado por', key: 'user',     width: 20 },
    ];

    movSheet.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center' };
    });

    const typeLabels = {
      initial_cash: 'Efectivo inicial',
      expense: 'Gasto',
      bank_withdrawal: 'Retiro de banco',
      adjustment: 'Ajuste',
    };

    for (const m of movements) {
      const time = m.created_at ? m.created_at.split(' ')[1] || '' : '';
      movSheet.addRow({
        date: m.date,
        time,
        type: typeLabels[m.movement_type] || m.movement_type,
        amount: m.amount,
        description: m.description || '—',
        category: m.category_name || '—',
        user: m.created_by_name,
      });
    }

    movSheet.getColumn('amount').numFmt = '"$"#,##0.00';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=caja_general_${from}_${to}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[TREASURY] Error en export:', err.message);
    res.status(500).json({ error: 'Error al exportar' });
  }
});

// ── GET /categories — listar categorías activas ─────────────────────────────
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY name ASC').all();
    res.json(categories);
  } catch (err) {
    console.error('[TREASURY] Error en categories:', err.message);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

// ── POST /categories — crear categoría ──────────────────────────────────────
router.post('/categories', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    const existing = db.prepare('SELECT id FROM expense_categories WHERE name = ?').get(name.trim());
    if (existing) {
      // Si existe pero está desactivada, reactivar
      const inactive = db.prepare('SELECT id FROM expense_categories WHERE name = ? AND is_active = 0').get(name.trim());
      if (inactive) {
        db.prepare('UPDATE expense_categories SET is_active = 1 WHERE id = ?').run(inactive.id);
        return res.status(201).json({ id: inactive.id, name: name.trim(), is_active: 1 });
      }
      return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    }

    const id = uuidv4();
    db.prepare('INSERT INTO expense_categories (id, name) VALUES (?, ?)').run(id, name.trim());
    res.status(201).json({ id, name: name.trim(), is_active: 1 });
  } catch (err) {
    console.error('[TREASURY] Error creando categoría:', err.message);
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

// ── PUT /categories/:id — editar categoría ──────────────────────────────────
router.put('/categories/:id', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    const cat = db.prepare('SELECT id FROM expense_categories WHERE id = ?').get(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });

    const duplicate = db.prepare('SELECT id FROM expense_categories WHERE name = ? AND id != ?').get(name.trim(), req.params.id);
    if (duplicate) return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });

    db.prepare('UPDATE expense_categories SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
    res.json({ id: req.params.id, name: name.trim() });
  } catch (err) {
    console.error('[TREASURY] Error editando categoría:', err.message);
    res.status(500).json({ error: 'Error al editar categoría' });
  }
});

// ── DELETE /categories/:id — desactivar categoría ───────────────────────────
router.delete('/categories/:id', (req, res) => {
  try {
    const cat = db.prepare('SELECT id FROM expense_categories WHERE id = ? AND is_active = 1').get(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });

    db.prepare('UPDATE expense_categories SET is_active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[TREASURY] Error desactivando categoría:', err.message);
    res.status(500).json({ error: 'Error al desactivar categoría' });
  }
});

module.exports = router;
