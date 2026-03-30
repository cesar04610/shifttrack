import { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const EMPTY = { name: '', phone: '', password: '', active: true };

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/employees').then(r => setEmployees(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (emp) => {
    setEditing(emp);
    setForm({ name: emp.name, phone: emp.phone || '', password: '', active: !!emp.active });
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const payload = { name: form.name, phone: form.phone, active: form.active };
        if (form.password) payload.password = form.password;
        await api.put(`/employees/${editing.id}`, payload);
        toast.success('Usuario actualizado');
      } else {
        await api.post('/employees', form);
        toast.success('Usuario creado');
      }
      setModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (emp) => {
    if (!confirm(`¿Desactivar a ${emp.name}?`)) return;
    try {
      await api.delete(`/employees/${emp.id}`);
      toast.success('Usuario desactivado');
      load();
    } catch (err) {
      toast.error('Error al desactivar');
    }
  };

  const handleReactivate = async (emp) => {
    try {
      await api.put(`/employees/${emp.id}`, { active: true });
      toast.success('Usuario reactivado');
      load();
    } catch (err) {
      toast.error('Error al reactivar');
    }
  };

  if (loading) return <div className="text-gray-400 py-10 text-center">Cargando...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Usuarios</h2>
        <button onClick={openCreate} className="btn-primary btn-sm">+ Nuevo usuario</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.length === 0 && (
              <tr><td colSpan={4} className="text-center text-gray-400 py-8">No hay usuarios registrados</td></tr>
            )}
            {employees.map(emp => (
              <tr key={emp.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{emp.name}</td>
                <td className="px-4 py-3 text-gray-600">{emp.phone || '—'}</td>
                <td className="px-4 py-3">
                  {emp.active ? <span className="badge-green">Activo</span> : <span className="badge-red">Inactivo</span>}
                </td>
                <td className="px-4 py-3 flex gap-2 justify-end">
                  <button onClick={() => openEdit(emp)} className="btn-secondary btn-sm">Editar</button>
                  {emp.active
                    ? <button onClick={() => handleDeactivate(emp)} className="btn-danger btn-sm">Desactivar</button>
                    : <button onClick={() => handleReactivate(emp)} className="btn btn-sm bg-green-600 text-white hover:bg-green-700 focus:ring-green-500">Reactivar</button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-lg">{editing ? 'Editar usuario' : 'Nuevo usuario'}</h3>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de usuario *</label>
                <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="Opcional" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editing ? 'Nueva contraseña (dejar en blanco para no cambiar)' : 'Contraseña *'}
                </label>
                <input type="password" className="input" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required={!editing} minLength={6} />
              </div>
              {editing && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active" checked={form.active} onChange={e => setForm({...form, active: e.target.checked})} className="rounded" />
                  <label htmlFor="active" className="text-sm text-gray-700">Usuario activo</label>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
