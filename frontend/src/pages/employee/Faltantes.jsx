import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

function formatDateTime(dt) {
  return new Date(dt).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ShortageForm({ onSaved, onCancel }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('El nombre del producto es requerido'); return; }
    setLoading(true);
    try {
      await api.post('/shortages', { name, note });
      toast.success('Producto registrado');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Registrar producto faltante</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Producto</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Nombre del producto..."
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nota (opcional)</label>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Algún detalle adicional..."
              />
            </div>
          </div>
          <div className="px-5 pb-4 flex gap-3">
            <button type="button" onClick={onCancel} className="flex-1 border rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClearConfirmModal({ onConfirmed, onCancel }) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await api.delete('/shortages');
      toast.success('Registros eliminados');
      onConfirmed();
    } catch {
      toast.error('Error al limpiar registros');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-800">¿Limpiar todos los registros?</h3>
        </div>
        <div className="px-5 py-4 text-sm text-gray-600">
          Se eliminarán todos los productos faltantes registrados. Esta acción no se puede deshacer.
        </div>
        <div className="px-5 pb-4 flex gap-3">
          <button onClick={onCancel} className="flex-1 border rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Limpiando...' : 'Sí, limpiar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Faltantes() {
  const { user } = useAuth();
  const [shortages, setShortages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showClear, setShowClear] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data } = await api.get('/shortages');
      setShortages(data);
    } catch {
      toast.error('Error al cargar faltantes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/shortages/${id}`);
      setShortages(prev => prev.filter(s => s.id !== id));
    } catch {
      toast.error('Error al eliminar');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Faltantes de producto</h1>
        <div className="flex gap-2">
          {shortages.length > 0 && (
            <button
              onClick={() => setShowClear(true)}
              className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
            >
              Limpiar registros
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="text-sm bg-blue-600 text-white rounded-lg px-4 py-1.5 font-medium hover:bg-blue-700 transition-colors"
          >
            + Registrar faltante
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>
      ) : shortages.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-sm">Sin faltantes registrados</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shortages.map(s => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800">{s.name}</p>
                {s.note && <p className="text-sm text-gray-500 mt-0.5">{s.note}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  {formatDateTime(s.registered_at)} · {s.registered_by_name}
                </p>
              </div>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 rounded px-2 py-1 shrink-0 transition-colors"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ShortageForm
          onSaved={() => { setShowForm(false); loadData(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {showClear && (
        <ClearConfirmModal
          onConfirmed={() => { setShowClear(false); loadData(); }}
          onCancel={() => setShowClear(false)}
        />
      )}
    </div>
  );
}
