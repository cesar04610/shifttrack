import { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import api from '../services/api';
import toast from 'react-hot-toast';

const PRIORITY_COLOR = {
  alta: 'border-l-red-500 bg-red-50',
  media: 'border-l-yellow-400 bg-yellow-50',
  baja: 'border-l-green-500 bg-green-50',
};
const PRIORITY_ICON = { alta: '🔴', media: '🟡', baja: '🟢' };

export default function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completeModal, setCompleteModal] = useState(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const [completing, setCompleting] = useState(false);
  const fileRef = useRef();

  const load = () => {
    setLoading(true);
    api.get('/tasks/my-tasks').then(r => setTasks(r.data)).catch(() => toast.error('Error al cargar tareas')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openComplete = (task) => {
    if (task.status === 'completada') return;
    setCompleteModal(task);
    setNote('');
    setPhoto(null);
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const formData = new FormData();
      if (note) formData.append('note', note);
      if (photo) formData.append('photo', photo);

      await api.post(`/tasks/instances/${completeModal.id}/complete`, formData);
      toast.success('¡Tarea completada!');
      setCompleteModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al completar');
    } finally {
      setCompleting(false);
    }
  };

  const today = format(new Date(), "EEEE d 'de' MMMM", { locale: undefined });
  const pending = tasks.filter(t => t.status === 'pendiente').length;
  const done = tasks.filter(t => t.status === 'completada').length;

  if (loading) return <div className="text-gray-400 py-10 text-center">Cargando...</div>;

  return (
    <div className="py-4">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Mis Tareas</h2>
      <p className="text-gray-500 text-sm mb-4 capitalize">{today}</p>

      {/* Progreso */}
      {tasks.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600">{done} de {tasks.length} completadas</span>
            <span className="font-medium text-blue-700">{Math.round((done / tasks.length) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${(done / tasks.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {tasks.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No tienes tareas asignadas para hoy.
        </div>
      )}

      {/* Lista de tareas */}
      <div className="space-y-3">
        {tasks.map(task => (
          <div
            key={task.id}
            className={`bg-white rounded-xl border-l-4 border border-gray-200 p-4 ${PRIORITY_COLOR[task.priority]} ${task.status === 'completada' ? 'opacity-70' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{PRIORITY_ICON[task.priority]}</span>
                  <span className={`font-semibold ${task.status === 'completada' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                    {task.title}
                  </span>
                </div>
                {task.description && (
                  <p className="text-sm text-gray-500 mt-1 ml-6">{task.description}</p>
                )}
                {task.status === 'completada' && task.completed_at && (
                  <p className="text-xs text-green-600 mt-1 ml-6">
                    ✅ Completada a las {format(new Date(task.completed_at), 'HH:mm')}
                    {task.note && <> · "{task.note}"</>}
                  </p>
                )}
                {task.status === 'vencida' && (
                  <p className="text-xs text-red-500 mt-1 ml-6">❌ Tarea vencida</p>
                )}
              </div>
              {task.status === 'pendiente' && (
                <button
                  onClick={() => openComplete(task)}
                  className="btn btn-sm bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 shrink-0"
                >
                  Completar
                </button>
              )}
              {task.status === 'completada' && (
                <span className="text-green-500 text-xl shrink-0">✓</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal: completar tarea */}
      {completeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-lg mb-1">Completar tarea</h3>
            <p className="text-sm text-gray-500 mb-5">{completeModal.title}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nota (opcional)</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Agrega un comentario opcional..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Foto de evidencia (opcional)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => setPhoto(e.target.files[0])}
                />
                {photo ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-green-600">📷 {photo.name}</span>
                    <button onClick={() => setPhoto(null)} className="text-xs text-red-500 hover:underline">Quitar</button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current.click()} className="btn-secondary btn-sm w-full">
                    📷 Tomar / adjuntar foto
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setCompleteModal(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleComplete} disabled={completing} className="btn-primary flex-1">
                {completing ? 'Guardando...' : '✅ Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
