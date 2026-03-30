import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../services/api';
import toast from 'react-hot-toast';
import AssignmentModal from '../components/tasks/AssignmentModal';
import CatalogForm from '../components/tasks/CatalogForm';

const PRIORITY_ICON = { alta: '🔴', media: '🟡', baja: '🟢' };
const PRIORITY_STYLE = {
  alta: 'bg-red-50 border-red-200 text-red-700',
  media: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  baja: 'bg-green-50 border-green-200 text-green-700',
};

export default function Tasks() {
  const [tab, setTab] = useState('dia');

  // Estado compartido
  const [catalog, setCatalog] = useState([]);

  // Estado: Tareas del día
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [instances, setInstances] = useState([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [assignModal, setAssignModal] = useState(null); // { employeeId?, date }
  const [detailModal, setDetailModal] = useState(null);

  // Estado: Catálogo
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogForm, setCatalogForm] = useState(null); // null | {} (new) | item (edit)

  // Estado: Asignaciones
  const [assignments, setAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [filterEmpId, setFilterEmpId] = useState('');
  const [employees, setEmployees] = useState([]);

  // ─── Cargar datos base ──────────────────────────────────────────────────────

  const loadCatalog = useCallback(() => {
    setLoadingCatalog(true);
    api.get('/tasks/catalog').then(r => setCatalog(r.data)).finally(() => setLoadingCatalog(false));
  }, []);

  useEffect(() => {
    api.get('/employees').then(r => setEmployees(r.data.filter(e => e.active)));
    loadCatalog();
  }, []);

  // ─── Tareas del día ─────────────────────────────────────────────────────────

  const loadDay = useCallback(() => {
    setLoadingDay(true);
    api.get(`/tasks/instances?date=${date}`).then(r => setInstances(r.data)).finally(() => setLoadingDay(false));
  }, [date]);

  useEffect(() => { if (tab === 'dia') loadDay(); }, [tab, date]);

  // Agrupar instancias por usuario
  const grouped = instances.reduce((acc, inst) => {
    if (!acc[inst.employee_id]) {
      acc[inst.employee_id] = { name: inst.employee_name, tasks: [], empId: inst.employee_id };
    }
    acc[inst.employee_id].tasks.push(inst);
    return acc;
  }, {});

  const handleRevert = async (inst) => {
    if (!confirm('¿Revertir esta tarea a pendiente?')) return;
    try {
      await api.put(`/tasks/instances/${inst.id}/revert`);
      toast.success('Revertida a pendiente');
      loadDay();
    } catch { toast.error('Error al revertir'); }
  };

  const handleExport = async () => {
    const res = await fetch(`/api/tasks/report?from=${date}&to=${date}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tareas_${date}.xlsx`;
    a.click();
  };

  // ─── Asignaciones ──────────────────────────────────────────────────────────

  const loadAssignments = useCallback(() => {
    setLoadingAssignments(true);
    const params = filterEmpId ? `?employee_id=${filterEmpId}` : '';
    api.get(`/tasks/assignments${params}`).then(r => setAssignments(r.data)).finally(() => setLoadingAssignments(false));
  }, [filterEmpId]);

  useEffect(() => { if (tab === 'asignaciones') loadAssignments(); }, [tab, filterEmpId]);

  const handleDeleteAssignment = async (asgn) => {
    if (!confirm(`¿Eliminar la asignación "${asgn.title}" de ${asgn.employee_name}?`)) return;
    try {
      await api.delete(`/tasks/assignments/${asgn.id}`);
      toast.success('Asignación eliminada');
      loadAssignments();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const handleToggleAssignment = async (asgn) => {
    try {
      await api.put(`/tasks/assignments/${asgn.id}`, { is_active: !asgn.is_active });
      toast.success(asgn.is_active ? 'Asignación pausada' : 'Asignación activada');
      loadAssignments();
    } catch { toast.error('Error al actualizar'); }
  };

  // ─── Catálogo: eliminar ────────────────────────────────────────────────────

  const handleDeleteCatalog = async (item) => {
    if (!confirm(`¿Eliminar "${item.title}" del catálogo?`)) return;
    try {
      await api.delete(`/tasks/catalog/${item.id}`);
      toast.success('Eliminada del catálogo');
      loadCatalog();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const recurrenceLabel = (a) => {
    if (a.recurrence_type === 'única') return `Una vez — ${a.start_date}`;
    if (a.recurrence_type === 'diaria') return `Diaria desde ${a.start_date}`;
    const dayNames = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const days = (a.recurrence_days || []).map(d => dayNames[d]).join(', ');
    return `Semanal (${days}) desde ${a.start_date}`;
  };

  return (
    <div>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-bold text-gray-900">Tareas</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setCatalogForm({})}
            className="btn-secondary btn-sm"
          >
            + Al catálogo
          </button>
          <button
            onClick={() => setAssignModal({ date })}
            className="btn-primary btn-sm"
          >
            + Asignar tarea
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'dia', label: '📋 Tareas del día' },
          { key: 'catalogo', label: '📚 Catálogo' },
          { key: 'asignaciones', label: '🔗 Asignaciones' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Tareas del día ─────────────────────────────────────────────── */}
      {tab === 'dia' && (
        <>
          {/* Barra de fecha */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
              <span className="text-gray-400 text-sm">📅</span>
              <input
                type="date"
                className="border-none outline-none text-sm font-medium text-gray-800 bg-transparent"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <span className="text-sm text-gray-500 capitalize">
              {format(new Date(date + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es })}
            </span>
            <button
              onClick={() => setDate(new Date().toISOString().split('T')[0])}
              className="text-xs text-blue-600 hover:underline"
            >
              Hoy
            </button>
            <div className="ml-auto flex gap-2">
              <button onClick={handleExport} className="btn btn-sm bg-green-600 text-white hover:bg-green-700 focus:ring-green-500">
                📥 Excel
              </button>
              <button onClick={() => setAssignModal({ date })} className="btn-primary btn-sm">
                + Asignar
              </button>
            </div>
          </div>

          {/* Resumen del día */}
          {instances.length > 0 && (
            <div className="flex gap-3 mb-4">
              {[
                { s: 'pendiente', label: 'pendientes', color: 'bg-yellow-100 text-yellow-800' },
                { s: 'completada', label: 'completadas', color: 'bg-green-100 text-green-800' },
                { s: 'vencida', label: 'vencidas', color: 'bg-red-100 text-red-800' },
              ].map(({ s, label, color }) => {
                const n = instances.filter(i => i.status === s).length;
                return n > 0 ? (
                  <span key={s} className={`text-xs px-3 py-1 rounded-full font-medium ${color}`}>
                    {n} {label}
                  </span>
                ) : null;
              })}
            </div>
          )}

          {loadingDay ? (
            <div className="text-center text-gray-400 py-10">Cargando...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="card text-center text-gray-400 py-10">
              <p className="text-3xl mb-2">📋</p>
              <p>No hay tareas asignadas para este día.</p>
              <button onClick={() => setAssignModal({ date })} className="btn-primary btn-sm mt-3">
                + Asignar primera tarea
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.values(grouped).map(group => {
                const done = group.tasks.filter(t => t.status === 'completada').length;
                const total = group.tasks.length;
                const pct = Math.round((done / total) * 100);
                return (
                  <div key={group.empId} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    {/* Header del usuario */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                          {group.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-semibold text-gray-800">{group.name}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{done}/{total}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setAssignModal({ date, employeeId: group.empId })}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 hover:border-blue-400 px-3 py-1 rounded-lg transition-colors"
                      >
                        + Asignar
                      </button>
                    </div>

                    {/* Lista de tareas del usuario */}
                    <div className="divide-y divide-gray-100">
                      {group.tasks.map(inst => (
                        <div key={inst.id} className={`flex items-center gap-3 px-4 py-3 ${inst.status === 'completada' ? 'opacity-60' : ''}`}>
                          <span className="text-lg shrink-0">{PRIORITY_ICON[inst.priority]}</span>
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm font-medium ${inst.status === 'completada' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                              {inst.title}
                            </span>
                            {inst.status === 'completada' && (
                              <div className="text-xs text-green-600 mt-0.5">
                                ✅ {format(new Date(inst.completed_at), 'HH:mm')}
                                {inst.note && <> · "{inst.note}"</>}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {inst.status === 'pendiente' && (
                              <span className="text-xs text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">Pendiente</span>
                            )}
                            {inst.status === 'vencida' && (
                              <span className="text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">Vencida</span>
                            )}
                            {(inst.note || inst.photo_path) && (
                              <button
                                onClick={() => setDetailModal(inst)}
                                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2 py-0.5 rounded"
                              >
                                Ver evidencia
                              </button>
                            )}
                            {inst.status === 'completada' && (
                              <button
                                onClick={() => handleRevert(inst)}
                                className="text-xs text-orange-500 hover:text-orange-700"
                              >
                                Revertir
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── TAB: Catálogo ───────────────────────────────────────────────────── */}
      {tab === 'catalogo' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              Crea aquí todas las tareas de tu tienda. Luego asígnalas a usuarios sin tener que escribirlas de nuevo.
            </p>
            <button onClick={() => setCatalogForm({})} className="btn-primary btn-sm shrink-0 ml-4">
              + Nueva tarea
            </button>
          </div>

          {loadingCatalog ? (
            <div className="text-center text-gray-400 py-10">Cargando...</div>
          ) : catalog.length === 0 ? (
            <div className="card text-center text-gray-400 py-10">
              <p className="text-3xl mb-2">📚</p>
              <p>El catálogo está vacío.</p>
              <button onClick={() => setCatalogForm({})} className="btn-primary btn-sm mt-3">
                + Crear primera tarea
              </button>
            </div>
          ) : (
            <div className="grid gap-2">
              {catalog.map(item => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
                  <span className={`text-xs px-2 py-1 rounded-full border font-medium shrink-0 ${PRIORITY_STYLE[item.priority]}`}>
                    {PRIORITY_ICON[item.priority]} {item.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{item.title}</p>
                    {item.description && <p className="text-xs text-gray-400 truncate">{item.description}</p>}
                  </div>
                  {item.active_assignments > 0 && (
                    <span className="text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded-full shrink-0">
                      {item.active_assignments} asignación{item.active_assignments !== 1 ? 'es' : ''}
                    </span>
                  )}
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setAssignModal({ date })}
                      className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1 rounded-lg font-medium transition-colors"
                    >
                      Asignar
                    </button>
                    <button onClick={() => setCatalogForm(item)} className="btn-secondary btn-sm">Editar</button>
                    <button onClick={() => handleDeleteCatalog(item)} className="btn-danger btn-sm">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── TAB: Asignaciones ──────────────────────────────────────────────── */}
      {tab === 'asignaciones' && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              className="input w-44"
              value={filterEmpId}
              onChange={e => setFilterEmpId(e.target.value)}
            >
              <option value="">Todos los usuarios</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button
              onClick={() => setAssignModal({ date })}
              className="btn-primary btn-sm"
            >
              + Nueva asignación
            </button>
          </div>

          {loadingAssignments ? (
            <div className="text-center text-gray-400 py-10">Cargando...</div>
          ) : assignments.length === 0 ? (
            <div className="card text-center text-gray-400 py-10">No hay asignaciones activas.</div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Tarea</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Usuario</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Repetición</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {assignments.map(a => (
                    <tr key={a.id} className={`hover:bg-gray-50 ${!a.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[a.priority]}`}>
                            {PRIORITY_ICON[a.priority]}
                          </span>
                          <span className="font-medium text-gray-800">{a.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{a.employee_name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{recurrenceLabel(a)}</td>
                      <td className="px-4 py-3 text-center">
                        {a.is_active
                          ? <span className="badge-green">Activa</span>
                          : <span className="badge-red">Pausada</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleToggleAssignment(a)}
                            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2 py-1 rounded"
                          >
                            {a.is_active ? 'Pausar' : 'Activar'}
                          </button>
                          <button onClick={() => handleDeleteAssignment(a)} className="btn-danger btn-sm">
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Modal: Asignar tarea (inteligente) ─────────────────────────────── */}
      {assignModal && (
        <AssignmentModal
          initialDate={assignModal.date}
          initialEmployeeId={assignModal.employeeId}
          catalog={catalog}
          onClose={() => setAssignModal(null)}
          onSaved={() => { loadDay(); loadAssignments(); }}
        />
      )}

      {/* ── Modal: Formulario del catálogo ─────────────────────────────────── */}
      {catalogForm !== null && (
        <CatalogForm
          item={Object.keys(catalogForm).length > 0 ? catalogForm : null}
          onClose={() => setCatalogForm(null)}
          onSaved={loadCatalog}
        />
      )}

      {/* ── Modal: Evidencia de tarea completada ───────────────────────────── */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-lg mb-4">{detailModal.title}</h3>
            {detailModal.note && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">Nota del usuario</p>
                <p className="text-sm bg-gray-50 border rounded-lg p-3 italic">"{detailModal.note}"</p>
              </div>
            )}
            {detailModal.photo_path && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">Foto de evidencia</p>
                <img src={`${detailModal.photo_path}?token=${localStorage.getItem('token')}`} alt="Evidencia" className="rounded-lg w-full object-cover max-h-64" />
              </div>
            )}
            <button onClick={() => setDetailModal(null)} className="btn-secondary w-full">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
