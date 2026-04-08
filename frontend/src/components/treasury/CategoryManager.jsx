import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function CategoryManager({ categories = [], onUpdate }) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await api.post('/treasury/categories', { name: newName.trim() });
      toast.success('Categoría creada');
      setNewName('');
      onUpdate?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear categoría');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (id) => {
    if (!editName.trim()) return;
    try {
      await api.put(`/treasury/categories/${id}`, { name: editName.trim() });
      toast.success('Categoría actualizada');
      setEditingId(null);
      onUpdate?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al editar');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Desactivar esta categoría?')) return;
    try {
      await api.delete(`/treasury/categories/${id}`);
      toast.success('Categoría desactivada');
      onUpdate?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al desactivar');
    }
  };

  const startEdit = (cat) => {
    setEditingId(cat.id);
    setEditName(cat.name);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Categorías de gastos</h3>

      {/* Agregar categoría */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          placeholder="Nueva categoría..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || !newName.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-1"
        >
          <Plus size={14} /> Agregar
        </button>
      </form>

      {/* Lista de categorías */}
      <div className="divide-y">
        {categories.map(cat => (
          <div key={cat.id} className="flex items-center justify-between py-2.5">
            {editingId === cat.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleEdit(cat.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <button onClick={() => handleEdit(cat.id)} className="p-1 text-green-600 hover:text-green-800">
                  <Check size={14} />
                </button>
                <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <span className="text-sm text-gray-700">{cat.name}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(cat)} className="p-1 text-gray-400 hover:text-blue-600">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleDelete(cat.id)} className="p-1 text-gray-400 hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-gray-400 py-4 text-center">Sin categorías</p>
        )}
      </div>
    </div>
  );
}
