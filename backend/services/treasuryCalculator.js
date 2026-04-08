const db = require('../db/database');
const { getLocalToday } = require('../utils/dateUtils');

/**
 * Encuentra la fecha y monto del initial_cash más reciente hasta `date`.
 * Retorna { date, amount } o null si no existe.
 */
function getInitialCash(date) {
  return db.prepare(`
    SELECT date, amount FROM treasury_movements
    WHERE movement_type = 'initial_cash' AND is_deleted = 0 AND date <= ?
    ORDER BY date DESC, created_at DESC LIMIT 1
  `).get(date) || null;
}

/**
 * Suma de ventas en efectivo (expected_cash) de cortes en un rango de fechas.
 */
function getCashSalesRange(fromDate, toDate) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(expected_cash), 0) AS total
    FROM cash_register_cuts
    WHERE date >= ? AND date <= ?
  `).get(fromDate, toDate);
  return row.total;
}

/**
 * Suma de pagos con tarjeta de cortes hasta una fecha.
 */
function getCardPaymentsUpTo(date) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(card_payments), 0) AS total
    FROM cash_register_cuts
    WHERE date <= ?
  `).get(date);
  return row.total;
}

/**
 * Suma de movimientos por tipo en un rango de fechas (excluye borrados).
 */
function sumMovementsByType(type, fromDate, toDate) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM treasury_movements
    WHERE movement_type = ? AND is_deleted = 0 AND date >= ? AND date <= ?
  `).get(type, fromDate, toDate);
  return row.total;
}

/**
 * Suma de pagos a proveedores (purchase_tickets) en un rango de fechas.
 * Se vincula con daily_sessions para obtener la fecha de la sesión.
 */
function getSupplierPaymentsRange(fromDate, toDate) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(pt.amount), 0) AS total
    FROM purchase_tickets pt
    JOIN daily_sessions ds ON pt.session_id = ds.id
    WHERE ds.session_date >= ? AND ds.session_date <= ?
      AND pt.is_voided = 0
  `).get(fromDate, toDate);
  return row.total;
}

/**
 * Obtiene los pagos a proveedores de una fecha específica (para listado).
 */
function getSupplierPaymentsForDate(date) {
  return db.prepare(`
    SELECT pt.id, pt.amount, pt.note, pt.registered_at,
           s.company_name AS supplier_name,
           u.name AS employee_name
    FROM purchase_tickets pt
    JOIN daily_sessions ds ON pt.session_id = ds.id
    JOIN suppliers s ON pt.supplier_id = s.id
    JOIN users u ON pt.employee_id = u.id
    WHERE ds.session_date = ? AND pt.is_voided = 0
    ORDER BY pt.registered_at ASC
  `).all(date);
}

/**
 * Suma acumulativa de movimientos por tipo hasta una fecha (para banco).
 */
function sumMovementsUpTo(type, date) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM treasury_movements
    WHERE movement_type = ? AND is_deleted = 0 AND date <= ?
  `).get(type, date);
  return row.total;
}

/**
 * Calcula el efectivo esperado a una fecha dada.
 * Acumulativo desde el initial_cash más reciente.
 */
function getExpectedCash(date) {
  const initial = getInitialCash(date);
  if (!initial) return 0;

  const fromDate = initial.date;
  const cashSales = getCashSalesRange(fromDate, date);
  const expenses = sumMovementsByType('expense', fromDate, date);
  const withdrawals = sumMovementsByType('bank_withdrawal', fromDate, date);
  const adjustments = sumMovementsByType('adjustment', fromDate, date);
  const supplierPayments = getSupplierPaymentsRange(fromDate, date);

  return initial.amount + cashSales - expenses + withdrawals + adjustments - supplierPayments;
}

/**
 * Calcula el saldo bancario acumulativo hasta una fecha.
 * Pagos con tarjeta (de cortes) - retiros de banco.
 */
function getBankBalance(date) {
  const cardPayments = getCardPaymentsUpTo(date);
  const withdrawals = sumMovementsUpTo('bank_withdrawal', date);
  return cardPayments - withdrawals;
}

/**
 * Balance total del negocio.
 */
function getTotalBalance(date) {
  return getExpectedCash(date) + getBankBalance(date);
}

/**
 * Obtiene movimientos de treasury_movements para una fecha, con joins.
 */
function getMovementsForDate(date) {
  return db.prepare(`
    SELECT tm.*, u.name AS created_by_name,
           ec.name AS category_name
    FROM treasury_movements tm
    JOIN users u ON tm.created_by = u.id
    LEFT JOIN expense_categories ec ON tm.category_id = ec.id
    WHERE tm.date = ? AND tm.is_deleted = 0
    ORDER BY tm.created_at ASC
  `).all(date);
}

/**
 * Obtiene movimientos en un rango con filtros opcionales.
 */
function getMovementsByRange(from, to, filters = {}) {
  let query = `
    SELECT tm.*, u.name AS created_by_name,
           ec.name AS category_name
    FROM treasury_movements tm
    JOIN users u ON tm.created_by = u.id
    LEFT JOIN expense_categories ec ON tm.category_id = ec.id
    WHERE tm.date >= ? AND tm.date <= ? AND tm.is_deleted = 0
  `;
  const params = [from, to];

  if (filters.type) {
    query += ' AND tm.movement_type = ?';
    params.push(filters.type);
  }
  if (filters.category_id) {
    query += ' AND tm.category_id = ?';
    params.push(filters.category_id);
  }

  query += ' ORDER BY tm.date ASC, tm.created_at ASC';
  return db.prepare(query).all(...params);
}

/**
 * Obtiene los cortes de caja de una fecha (para mostrar en movimientos del día).
 */
function getCutsForDate(date) {
  return db.prepare(`
    SELECT c.id, c.register_name, c.total_sales, c.card_payments,
           c.expected_cash, c.shift_label, c.submitted_at,
           u.name AS employee_name
    FROM cash_register_cuts c
    JOIN users u ON c.employee_id = u.id
    WHERE c.date = ?
    ORDER BY c.submitted_at ASC
  `).all(date);
}

/**
 * Resumen completo para una fecha dada.
 */
function getDailySummary(date) {
  const initial = getInitialCash(date);
  const hasInitialCash = !!initial;

  const cash = getExpectedCash(date);
  const bank = getBankBalance(date);
  const total = cash + bank;

  // Desglose del día
  const cashSalesRow = db.prepare(`
    SELECT COALESCE(SUM(expected_cash), 0) AS total
    FROM cash_register_cuts WHERE date = ?
  `).get(date);

  const cardPaymentsRow = db.prepare(`
    SELECT COALESCE(SUM(card_payments), 0) AS total
    FROM cash_register_cuts WHERE date = ?
  `).get(date);

  const expensesRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM treasury_movements
    WHERE date = ? AND movement_type = 'expense' AND is_deleted = 0
  `).get(date);

  const withdrawalsRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM treasury_movements
    WHERE date = ? AND movement_type = 'bank_withdrawal' AND is_deleted = 0
  `).get(date);

  const adjustmentsRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM treasury_movements
    WHERE date = ? AND movement_type = 'adjustment' AND is_deleted = 0
  `).get(date);

  const supplierPaymentsRow = db.prepare(`
    SELECT COALESCE(SUM(pt.amount), 0) AS total
    FROM purchase_tickets pt
    JOIN daily_sessions ds ON pt.session_id = ds.id
    WHERE ds.session_date = ? AND pt.is_voided = 0
  `).get(date);

  const movements = getMovementsForDate(date);
  const cuts = getCutsForDate(date);
  const supplierPayments = getSupplierPaymentsForDate(date);

  return {
    date,
    cash,
    bank,
    total,
    hasInitialCash,
    initialCashAmount: initial ? initial.amount : 0,
    cashSales: cashSalesRow.total,
    cardPayments: cardPaymentsRow.total,
    totalExpenses: expensesRow.total,
    totalWithdrawals: withdrawalsRow.total,
    totalAdjustments: adjustmentsRow.total,
    totalSupplierPayments: supplierPaymentsRow.total,
    movements,
    cuts,
    supplierPayments,
  };
}

/**
 * Historial de saldos diarios para un rango de fechas.
 */
function getHistoryRange(from, to) {
  const days = [];
  const current = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');

  while (current <= end) {
    const dateStr = current.getFullYear() + '-' +
      String(current.getMonth() + 1).padStart(2, '0') + '-' +
      String(current.getDate()).padStart(2, '0');

    const cash = getExpectedCash(dateStr);
    const bank = getBankBalance(dateStr);

    // Contar movimientos del día
    const movCount = db.prepare(`
      SELECT COUNT(*) AS cnt FROM treasury_movements
      WHERE date = ? AND is_deleted = 0
    `).get(dateStr);

    const cutCount = db.prepare(`
      SELECT COUNT(*) AS cnt FROM cash_register_cuts
      WHERE date = ?
    `).get(dateStr);

    days.push({
      date: dateStr,
      cash,
      bank,
      total: cash + bank,
      movementCount: movCount.cnt,
      cutCount: cutCount.cnt,
    });

    current.setDate(current.getDate() + 1);
  }

  return days;
}

module.exports = {
  getInitialCash,
  getExpectedCash,
  getBankBalance,
  getTotalBalance,
  getDailySummary,
  getMovementsForDate,
  getMovementsByRange,
  getCutsForDate,
  getSupplierPaymentsForDate,
  getHistoryRange,
};
