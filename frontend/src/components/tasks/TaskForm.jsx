import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const DAYS = [
  { label: 'L', value: 1 }, { label: 'M', value: 2 }, { label: 'X', value: 3 },
  { label: 'J', value: 4 }, { label: 'V', value: 5 }, { label: 'S', value: 6 }, { label: 'D', value: 7 },
];

const EMPTY = {
  title: '', description: '', priority: 'media', employee_id: '',
  recurrence_type: 'única', recurrence_days: [], start_date: new Date().toISOString().split('T')[0],
};

export default function TaskForm({ task, employees, onClose, onSaved }) {
  const [form, setForm] = useState(task ? {
    title: task.title, description: task.description || '', priority: task.priority,
    employee_id: task.employee_id, recurrence_type: task.recurrence_type,
    recurrence_days: task.recurrence_days || [], start_date: task.start_date,
  } : EMPTY);
  const [saving, setSaving] = useState(false);

  const toggleDay = (val) => {
    setForm(f => ({
      ...f,
      recurrence_days: f.recurrence_days.includes(val)
        ? f.recurrence_days.filter(d => d !== val)
        : [...f.recurrence_days, val].sort((a, b) => a - b),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.recurrence_type === 'semanal' && form.recurrence_days.length === 0) {
      toast.error('Selecciona al menos un día de la semana');
      return;
    }
    setSaving(true);
    try {
      if (task) {
        await api.put(`/tasks/${task.id}`, form);
        toast.success('Tarea actualizada');
      } else {
        await api.post('/tasks', form);
        toast.success('Tarea creada');
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b">
          <h3 className="font-semibold text-lg">{task ? 'Editar tarea' : 'Nueva tarea'}</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
            <input className="input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required placeholder="Ej: Limpieza del área de cajas" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea className="input resize-none" rows={2} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Instrucciones opcionales..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad *</label>
              <select className="input" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                <option value="alta">🔴 Alta</option>
                <option value="media">🟡 Media</option>
                <option value="baja">🟢 Baja</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio *</label>
              <input type="date" className="input" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario asignado *</label>
            <select className="input" value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})} required>
              <option value="">Selecciona usuario</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recurrencia *</label>
            <select className="input" value={form.recurrence_type} onChange={e => setForm({...form, recurrence_type: e.target.value, recurrence_days: []})}>
              <option value="única">Una sola vez</option>
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal</option>
            </select>
          </div>
          {form.recurrence_type === 'semanal' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Días de la semana *</label>
              <div className="flex gap-2">
                {DAYS.map(d => (
                  <button
                    key={d.value} type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`w-9 h-9 rounded-full text-sm font-bold transition-colors ${
                      form.recurrence_days.includes(d.value)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {task && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active !== false} onChange={e => setForm({...form, is_active: e.target.checked})} className="rounded" />
              <label htmlFor="is_active" className="text-sm text-gray-700">Tarea activa</label>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
