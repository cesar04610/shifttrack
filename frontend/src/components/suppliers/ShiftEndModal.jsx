import { useState } from 'react';

function formatMXN(value) {
  return Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ShiftEndModal({ expectedBalance, onConfirmed, onCancel }) {
  const [realBalance, setRealBalance] = useState('');
  const [loading, setLoading] = useState(false);

  const cashDiff = realBalance !== '' ? parseFloat(realBalance) - expectedBalance : null;

  const handleConfirm = async () => {
    if (realBalance === '') return;
    setLoading(true);
    try {
      await onConfirmed(parseFloat(realBalance));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Cierre de turno</h3>
          <p className="text-sm text-gray-500 mt-0.5">Declara el saldo real en caja antes de salir</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Saldo esperado:</span>
              <span className="font-medium">${formatMXN(expectedBalance)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Saldo real en caja <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={realBalance}
                onChange={e => setRealBalance(e.target.value)}
                className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                autoFocus
              />
            </div>
          </div>

          {cashDiff !== null && (
            <div className={`rounded-lg p-3 text-sm ${cashDiff < 0 ? 'bg-red-50 border border-red-200' : cashDiff > 0 ? 'bg-blue-50 border border-blue-200' : 'bg-green-50 border border-green-200'}`}>
              <div className="flex justify-between items-center">
                <span className="text-gray-700 font-medium">Diferencia:</span>
                <span className={`font-bold text-base ${cashDiff < 0 ? 'text-red-600' : cashDiff > 0 ? 'text-blue-600' : 'text-green-600'}`}>
                  {cashDiff >= 0 ? '+' : ''}${formatMXN(cashDiff)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {cashDiff < 0 ? 'Faltante en caja' : cashDiff > 0 ? 'Sobrante en caja' : 'Caja cuadrada perfectamente'}
              </p>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            Este saldo sera el saldo inicial para el siguiente turno.
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onCancel} className="flex-1 border rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || realBalance === ''}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Confirmar y salir'}
          </button>
        </div>
      </div>
    </div>
  );
}
