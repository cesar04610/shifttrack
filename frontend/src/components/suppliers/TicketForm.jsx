import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

function formatMXN(value) {
  return Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TicketForm({ suppliers, onSaved, onCancel }) {
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [warning, setWarning] = useState(null); // { historical_avg, deviation_pct, day_name }
  const [confirmStep, setConfirmStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkTimeout = useRef(null);

  // Verificar alerta cada vez que cambia proveedor o monto
  useEffect(() => {
    setWarning(null);
    setConfirmStep(false);
    if (!supplierId || !amount || parseFloat(amount) <= 0) return;

    clearTimeout(checkTimeout.current);
    checkTimeout.current = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await api.get('/tickets/check', { params: { supplier_id: supplierId, amount } });
        if (res.data.should_warn) {
          setWarning(res.data);
        } else {
          setWarning(null);
        }
      } catch { /* silencioso */ } finally {
        setChecking(false);
      }
    }, 500);

    return () => clearTimeout(checkTimeout.current);
  }, [supplierId, amount]);

  const handleConfirmClick = () => {
    if (!supplierId) { toast.error('Selecciona un proveedor'); return; }
    if (!amount || parseFloat(amount) <= 0) { toast.error('Ingresa un monto válido'); return; }
    if (warning && !confirmStep) {
      setConfirmStep(true); // Muestra la advertencia para confirmar
      return;
    }
    submitTicket();
  };

  const submitTicket = async () => {
    setLoading(true);
    try {
      const res = await api.post('/tickets', { supplier_id: supplierId, amount: parseFloat(amount), note: note || undefined });
      toast.success('Ticket registrado');
      onSaved(res.data.current_balance);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar ticket');
      setConfirmStep(false);
    } finally {
      setLoading(false);
    }
  };

  const selectedSupplier = suppliers.find(s => s.id === supplierId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Registrar pago a proveedor</h2>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Proveedor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Proveedor <span className="text-red-500">*</span>
            </label>
            <select
              value={supplierId}
              onChange={e => { setSupplierId(e.target.value); setConfirmStep(false); }}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Seleccionar proveedor —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.company_name}</option>
              ))}
            </select>
            {selectedSupplier && (
              <p className="text-xs text-gray-500 mt-1">
                Rep: {selectedSupplier.rep_name}
                {selectedSupplier.rep_phone && ` | ${selectedSupplier.rep_phone}`}
              </p>
            )}
          </div>

          {/* Monto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => { setAmount(e.target.value); setConfirmStep(false); }}
                className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
            {checking && <p className="text-xs text-gray-400 mt-1">Verificando promedio histórico...</p>}
          </div>

          {/* Nota opcional */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nota (opcional)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: incluye devolución de envases"
            />
          </div>

          {/* Advertencia de ticket inusual */}
          {warning && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 text-lg">⚠️</span>
                <div className="text-sm">
                  <p className="font-semibold text-amber-800">Ticket inusual</p>
                  <p className="text-amber-700 mt-0.5">
                    Este monto es <strong>+{warning.deviation_pct}%</strong> mayor al promedio del{' '}
                    <strong>{warning.day_name}</strong> (${formatMXN(warning.historical_avg)}).
                  </p>
                  {confirmStep && (
                    <p className="text-amber-700 font-medium mt-1">¿Deseas confirmar de todas formas?</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={loading}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${
              confirmStep ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Registrando...' : confirmStep ? 'Sí, confirmar' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
