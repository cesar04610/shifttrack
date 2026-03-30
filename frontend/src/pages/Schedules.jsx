import { useEffect, useState } from 'react';
import { format, startOfWeek, addDays, parseISO, addWeeks, subWeeks } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../services/api';
import toast from 'react-hot-toast';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const EMPTY_FORM = { employee_id: '', date: '', start_time: '08:00', end_time: '16:00' };

export default function Schedules() {
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [schedules, setSchedules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [cloning, setCloning] = useState(false);

  const monday = format(currentWeek, 'yyyy-MM-dd');
  const weekLabel = `${format(currentWeek, "d 'de' MMM", { locale: es })} – ${format(addDays(currentWeek, 6), "d 'de' MMM yyyy", { locale: es })}`;

  const loadSchedules = () => {
    api.get(`/schedules?week=${monday}`).then(r => setSchedules(r.data));
  };

  useEffect(() => {
    api.get('/employees').then(r => setEmployees(r.data.filter(e => e.active)));
  }, []);

  useEffect(() => { loadSchedules(); }, [monday]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i));

  const getShiftsForDay = (date) => {
    const d = format(date, 'yyyy-MM-dd');
    return schedules.filter(s => s.date === d);
  };

  const openCreate = (date) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, date: format(date, 'yyyy-MM-dd') });
    setModal(true);
  };

  const openEdit = (shift) => {
    setEditing(shift);
    setForm({ employee_id: shift.employee_id, date: shift.date, start_time: shift.start_time, end_time: shift.end_time });
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/schedules/${editing.id}`, form);
        toast.success('Turno actualizado');
      } else {
        await api.post('/schedules', form);
        toast.success('Turno creado');
      }
      setModal(false);
      loadSchedules();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (shift) => {
    if (!confirm(`¿Eliminar turno de ${shift.employee_name}?`)) return;
    try {
      await api.delete(`/schedules/${shift.id}`);
      toast.success('Turno eliminado');
      loadSchedules();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const handleClone = async () => {
    const nextMonday = format(addWeeks(currentWeek, 1), 'yyyy-MM-dd');
    if (!confirm(`¿Clonar todos los turnos de esta semana a la siguiente (${format(addWeeks(currentWeek, 1), "d MMM", { locale: es })})?`)) return;
    setCloning(true);
    try {
      const res = await api.post('/schedules/clone', { from_week: monday, to_week: nextMonday });
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al clonar');
    } finally {
      setCloning(false);
    }
  };

  const COLORS = [
    'bg-blue-100 text-blue-800 border-blue-200',
    'bg-purple-100 text-purple-800 border-purple-200',
    'bg-green-100 text-green-800 border-green-200',
    'bg-orange-100 text-orange-800 border-orange-200',
    'bg-pink-100 text-pink-800 border-pink-200',
    'bg-teal-100 text-teal-800 border-teal-200',
    'bg-yellow-100 text-yellow-800 border-yellow-200',
  ];
  const empColorMap = {};
  employees.forEach((e, i) => { empColorMap[e.id] = COLORS[i % COLORS.length]; });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Horarios</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentWeek(w => subWeeks(w, 1))} className="btn-secondary btn-sm">← Anterior</button>
          <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">{weekLabel}</span>
          <button onClick={() => setCurrentWeek(w => addWeeks(w, 1))} className="btn-secondary btn-sm">Siguiente →</button>
          <button onClick={handleClone} disabled={cloning} className="btn btn-sm bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400">
            {cloning ? 'Clonando...' : '📋 Clonar semana'}
          </button>
        </div>
      </div>

      {/* Calendario semanal */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day, idx) => {
          const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          const shifts = getShiftsForDay(day);
          return (
            <div key={idx} className={`bg-white rounded-lg border ${isToday ? 'border-blue-400 shadow-md' : 'border-gray-200'} min-h-[140px] flex flex-col`}>
              <div className={`px-2 py-1.5 rounded-t-lg text-center ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600'}`}>
                <div className="text-xs font-semibold">{DAYS[idx]}</div>
                <div className={`text-lg font-bold ${isToday ? 'text-white' : 'text-gray-800'}`}>{format(day, 'd')}</div>
              </div>
              <div className="flex-1 p-1.5 space-y-1">
                {shifts.map(shift => (
                  <div
                    key={shift.id}
                    className={`text-xs p-1.5 rounded border cursor-pointer hover:opacity-80 ${empColorMap[shift.employee_id] || COLORS[0]}`}
                    onClick={() => openEdit(shift)}
                    title="Clic para editar"
                  >
                    <div className="font-semibold truncate">{shift.employee_name}</div>
                    <div className="opacity-75">{shift.start_time}–{shift.end_time}</div>
                  </div>
                ))}
                <button
                  onClick={() => openCreate(day)}
                  className="w-full text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded p-1 transition-colors text-center"
                >
                  + turno
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda usuarios */}
      {employees.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {employees.map(e => (
            <span key={e.id} className={`text-xs px-2 py-1 rounded-full border ${empColorMap[e.id] || COLORS[0]}`}>
              {e.name}
            </span>
          ))}
        </div>
      )}

      {/* Modal crear/editar turno */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-lg">{editing ? 'Editar turno' : 'Nuevo turno'}</h3>
              {editing && (
                <button onClick={() => handleDelete(editing)} className="text-red-500 hover:text-red-700 text-sm">Eliminar</button>
              )}
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuario *</label>
                <select className="input" value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})} required>
                  <option value="">Selecciona usuario</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                <input type="date" className="input" value={form.date} onChange={e => setForm({...form, date: e.target.value})} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora inicio *</label>
                  <input type="time" className="input" value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora fin *</label>
                  <input type="time" className="input" value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} required />
                </div>
              </div>
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
