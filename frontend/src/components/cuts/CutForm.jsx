import { useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

function formatMXN(v) {
  return Number(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
}

export default function CutForm({ schedule, onSaved, onCancel }) {
  const { user } = useAuth();
  const registerName = `Caja ${user?.caja || '?'}`;

  const [form, setForm] = useState({
    total_sales: '',
    card_payments: '',
    declared_cash: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);

  const ts = parseFloat(form.total_sales) || 0;
  const cp = parseFloat(form.card_payments) || 0;
  const dc = parseFloat(form.declared_cash) || 0;
  const expectedCash = ts - cp;
  const cashDiff = dc - expectedCash; // positivo = sobrante, negativo = faltante

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.total_sales === '') { toast.error('Ingresa las ventas totales'); return; }
    if (form.card_payments === '') { toast.error('Ingresa los pagos con tarjeta'); return; }
    if (form.declared_cash === '') { toast.error('Ingresa el efectivo declarado'); return; }
    setLoading(true);
    try {
      await api.post('/cuts', {
        register_name: registerName,
        total_sales: parseFloat(form.total_sales),
        card_payments: parseFloat(form.card_payments),
        declared_cash: parseFloat(form.declared_cash),
        notes: form.notes || undefined,
      });
      toast.success('Corte registrado correctamente');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar corte');
    } finally {
      setLoading(false);
    }
  };

  const diffColor = Math.abs(cashDiff) === 0 ? 'text-green-600' : Math.abs(cashDiff) <= 100 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Registrar corte de caja</h2>
          {schedule && (
            <p className="text-sm text-gray-500 mt-0.5">Turno {schedule.start_time}–{schedule.end_time}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800 font-medium">
            {registerName}
          </div>

          {[
            { name: 'total_sales', label: 'Ventas totales (del POS)' },
            { name: 'card_payments', label: 'Pagos con tarjeta' },
            { name: 'declared_cash', label: 'Efectivo declarado en caja' },
          ].map(({ name, label }) => (
            <div key={name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label} <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  name={name}
                  min="0"
                  step="0.01"
                  value={form[name]}
                  onChange={handleChange}
                  className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          ))}

          {/* Cálculo en tiempo real */}
          {(form.total_sales !== '' || form.card_payments !== '' || form.declared_cash !== '') && (
            <div className="bg-gray-50 border rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cálculo automático</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Efectivo esperado</span>
                <span className="font-medium">${formatMXN(expectedCash)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Efectivo declarado</span>
                <span className="font-medium">${formatMXN(dc)}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="font-semibold text-gray-700">Diferencia</span>
                <span className={`font-bold text-base ${diffColor}`}>
                  {cashDiff >= 0 ? '+' : '-'}${formatMXN(Math.abs(cashDiff))}
                  {cashDiff > 0 ? ' (sobrante)' : cashDiff < 0 ? ' (faltante)' : ' ✓'}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones (opcional)</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Notas adicionales..."
            />
          </div>

          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            ⚠️ Este registro es definitivo. Una vez enviado no podrá modificarse.
          </p>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCancel} className="flex-1 border rounded-lg py-2.5 text-sm text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Registrando...' : 'Confirmar corte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
