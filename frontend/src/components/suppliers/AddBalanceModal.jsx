import { useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function AddBalanceModal({ onSaved, onCancel }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (amount === '' || parseFloat(amount) <= 0) {
      toast.error('Ingresa un monto mayor a 0');
      return;
    }
    setLoading(true);
    try {
      await api.post('/sessions/add-balance', { amount: parseFloat(amount) });
      toast.success(`$${parseFloat(amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} agregado a caja`);
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al agregar saldo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Agregar saldo a caja</h3>
          <p className="text-sm text-gray-500 mt-0.5">Ingresa la cantidad a agregar</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto a agregar <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full border rounded-lg pl-7 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="0.00"
                autoFocus
              />
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onCancel} className="flex-1 border rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || amount === '' || parseFloat(amount) <= 0}
            className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Agregando...' : 'Agregar saldo'}
          </button>
        </div>
      </div>
    </div>
  );
}
