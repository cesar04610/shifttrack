import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import SupplierForm from '../../components/suppliers/SupplierForm';

export default function Proveedores() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/suppliers', { params: { active_only: showAll ? 'false' : 'true' } });
      setSuppliers(res.data);
    } catch {
      toast.error('Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [showAll]);

  const filtered = suppliers.filter(s =>
    !search || s.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.product_type || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleActive = async (supplier) => {
    try {
      await api.put(`/suppliers/${supplier.id}`, { active: !supplier.active });
      toast.success(supplier.active ? 'Proveedor desactivado' : 'Proveedor activado');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/suppliers/${id}`);
      toast.success('Proveedor eliminado');
      setDeletingId(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Proveedores</h1>
        <button
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1"
        >
          + Nuevo
        </button>
      </div>

      {/* Búsqueda y filtros */}
      <div className="space-y-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o tipo de producto..."
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
            className="rounded"
          />
          Mostrar también proveedores inactivos
        </label>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {search ? 'No se encontraron proveedores con ese criterio' : 'No hay proveedores registrados aún'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <div key={s.id} className={`bg-white rounded-lg border p-4 ${!s.active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{s.company_name}</span>
                    {!s.active && (
                      <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Inactivo</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    👤 {s.rep_name}
                    {s.rep_phone && <span className="ml-2">📞 {s.rep_phone}</span>}
                  </div>
                  {s.product_type && (
                    <div className="text-xs text-gray-500 mt-0.5">🏷️ {s.product_type}</div>
                  )}
                </div>

                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => { setEditing(s); setFormOpen(true); }}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="Editar"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleToggleActive(s)}
                    className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded"
                    title={s.active ? 'Desactivar' : 'Activar'}
                  >
                    {s.active ? '🔕' : '✅'}
                  </button>
                  <button
                    onClick={() => setDeletingId(s.id)}
                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Eliminar"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal confirmar eliminación */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">¿Eliminar proveedor?</h3>
            <p className="text-sm text-gray-600">
              El proveedor será desactivado. Sus tickets históricos se conservarán.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 border rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={() => handleDelete(deletingId)} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <SupplierForm
          supplier={editing}
          onSaved={() => { setFormOpen(false); setEditing(null); load(); }}
          onCancel={() => { setFormOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
