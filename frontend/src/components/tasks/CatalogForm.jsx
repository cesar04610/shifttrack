import { useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const EMPTY = { title: '', description: '', priority: 'media' };

export default function CatalogForm({ item, onClose, onSaved }) {
  const [form, setForm] = useState(item ? { title: item.title, description: item.description || '', priority: item.priority } : EMPTY);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (item) {
        await api.put(`/tasks/catalog/${item.id}`, form);
        toast.success('Tarea actualizada en el catálogo');
      } else {
        await api.post('/tasks/catalog', form);
        toast.success('Tarea agregada al catálogo');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-4 border-b">
          <h3 className="font-semibold text-lg">{item ? 'Editar tarea' : 'Nueva tarea al catálogo'}</h3>
          {!item && <p className="text-xs text-gray-400 mt-0.5">Crea la tarea una sola vez y asígnala a quien quieras después</p>}
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la tarea *</label>
            <input
              className="input"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              required
              placeholder="Ej: Limpieza de refrigeradores"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instrucciones / descripción</label>
            <textarea
              className="input resize-none"
              rows={3}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Pasos o notas opcionales..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Prioridad</label>
            <div className="flex gap-2">
              {[
                { value: 'alta', label: '🔴 Alta', color: 'bg-red-100 border-red-300 text-red-700' },
                { value: 'media', label: '🟡 Media', color: 'bg-yellow-100 border-yellow-300 text-yellow-700' },
                { value: 'baja', label: '🟢 Baja', color: 'bg-green-100 border-green-300 text-green-700' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, priority: opt.value })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                    form.priority === opt.value
                      ? opt.color + ' border-current scale-105'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando...' : item ? 'Guardar cambios' : 'Agregar al catálogo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
