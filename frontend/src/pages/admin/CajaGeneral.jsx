import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import TreasurySummaryCards from '../../components/treasury/TreasurySummaryCards';
import ExpenseForm from '../../components/treasury/ExpenseForm';
import BankWithdrawalForm from '../../components/treasury/BankWithdrawalForm';
import MovementsList from '../../components/treasury/MovementsList';
import TreasuryHistory from '../../components/treasury/TreasuryHistory';
import CategoryManager from '../../components/treasury/CategoryManager';

function formatMXN(value) {
  return Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const tabs = [
  { id: 'today', label: 'Hoy' },
  { id: 'history', label: 'Historial' },
  { id: 'categories', label: 'Categorías' },
];

export default function CajaGeneral() {
  const [tab, setTab] = useState('today');
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Efectivo inicial
  const [initialAmount, setInitialAmount] = useState('');
  const [savingInitial, setSavingInitial] = useState(false);

  // Ajuste de efectivo
  const [adjustAmount, setAdjustAmount] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const r = await api.get('/treasury/summary');
      setSummary(r.data);
    } catch {
      toast.error('Error al cargar resumen');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const r = await api.get('/treasury/categories');
      setCategories(r.data);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchCategories();
  }, [fetchSummary, fetchCategories]);

  const refresh = () => {
    fetchSummary();
  };

  // Registrar efectivo inicial
  const handleInitialCash = async (e) => {
    e.preventDefault();
    if (!initialAmount || Number(initialAmount) < 0) return toast.error('Ingresa un monto válido');
    setSavingInitial(true);
    try {
      await api.post('/treasury/initial-cash', { amount: Number(initialAmount) });
      toast.success('Efectivo inicial registrado');
      setInitialAmount('');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar');
    } finally {
      setSavingInitial(false);
    }
  };

  // Ajuste de efectivo
  const handleAdjustment = async (e) => {
    e.preventDefault();
    if (!adjustAmount || Number(adjustAmount) < 0) return toast.error('Ingresa el monto real');
    setSavingAdjust(true);
    try {
      const r = await api.post('/treasury/adjustment', { declared_amount: Number(adjustAmount) });
      const diff = r.data.amount;
      toast.success(`Ajuste registrado (${diff >= 0 ? '+' : ''}$${formatMXN(diff)})`);
      setAdjustAmount('');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al ajustar');
    } finally {
      setSavingAdjust(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Caja General</h1>
        <p className="text-sm text-gray-500 mt-1">Control de efectivo, banco y balance total del negocio</p>
      </div>

      {/* Indicadores */}
      <TreasurySummaryCards
        cash={summary?.cash || 0}
        bank={summary?.bank || 0}
        total={summary?.total || 0}
        loading={loading}
      />

      {/* Tabs */}
      <div className="flex border-b gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Hoy */}
      {tab === 'today' && summary && (
        <div className="space-y-6">
          {/* Primera vez: registrar efectivo inicial */}
          {!summary.hasInitialCash && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">Registrar efectivo inicial</h3>
              <p className="text-xs text-amber-600 mb-3">
                Ingresa el efectivo disponible para comenzar a usar la Caja General.
              </p>
              <form onSubmit={handleInitialCash} className="flex gap-3">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="$0.00"
                  value={initialAmount}
                  onChange={e => setInitialAmount(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  disabled={savingInitial}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {savingInitial ? 'Guardando...' : 'Registrar'}
                </button>
              </form>
            </div>
          )}

          {/* Formularios de captura + ajuste */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gasto */}
            <div className="bg-white rounded-xl border p-5">
              <ExpenseForm categories={categories} onSuccess={refresh} />
            </div>

            {/* Retiro de banco */}
            <div className="bg-white rounded-xl border p-5">
              <BankWithdrawalForm onSuccess={refresh} />
            </div>

            {/* Ajuste de efectivo */}
            <div className="bg-white rounded-xl border p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Ajustar Efectivo</h3>
              <p className="text-xs text-gray-500 mb-3">
                Ingresa el efectivo real que tienes. El sistema calculará la diferencia.
              </p>
              <div className="text-xs text-gray-400 mb-2">
                Efectivo esperado: <span className="font-medium text-gray-600">${formatMXN(summary.cash)}</span>
              </div>
              <form onSubmit={handleAdjustment} className="space-y-3">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Monto real..."
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                <button
                  type="submit"
                  disabled={savingAdjust}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {savingAdjust ? 'Ajustando...' : 'Actualizar efectivo'}
                </button>
              </form>
            </div>
          </div>

          {/* Desglose del día */}
          {summary.hasInitialCash && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Ventas efectivo', value: summary.cashSales, color: 'text-green-700' },
                { label: 'Pagos tarjeta', value: summary.cardPayments, color: 'text-blue-700' },
                { label: 'Proveedores', value: summary.totalSupplierPayments, color: 'text-orange-600' },
                { label: 'Gastos', value: summary.totalExpenses, color: 'text-red-600' },
                { label: 'Retiros banco', value: summary.totalWithdrawals, color: 'text-blue-600' },
                { label: 'Ajustes', value: summary.totalAdjustments, color: summary.totalAdjustments < 0 ? 'text-red-600' : 'text-green-700' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-lg border px-3 py-2.5">
                  <p className="text-xs text-gray-500">{item.label}</p>
                  <p className={`text-sm font-semibold ${item.color}`}>${formatMXN(item.value)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Movimientos del día */}
          <div className="bg-white rounded-xl border p-5">
            <MovementsList
              movements={summary.movements || []}
              cuts={summary.cuts || []}
              supplierPayments={summary.supplierPayments || []}
              isToday={true}
              onDelete={refresh}
            />
          </div>
        </div>
      )}

      {/* Tab: Historial */}
      {tab === 'history' && (
        <div className="bg-white rounded-xl border p-5">
          <TreasuryHistory />
        </div>
      )}

      {/* Tab: Categorías */}
      {tab === 'categories' && (
        <div className="bg-white rounded-xl border p-5 max-w-lg">
          <CategoryManager categories={categories} onUpdate={fetchCategories} />
        </div>
      )}
    </div>
  );
}
