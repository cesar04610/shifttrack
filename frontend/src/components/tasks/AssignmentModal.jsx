import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const DAYS = [
  { label: 'L', value: 1 }, { label: 'M', value: 2 }, { label: 'X', value: 3 },
  { label: 'J', value: 4 }, { label: 'V', value: 5 }, { label: 'S', value: 6 }, { label: 'D', value: 7 },
];

const PRIORITY_COLOR = {
  alta: 'text-red-600 bg-red-50',
  media: 'text-yellow-700 bg-yellow-50',
  baja: 'text-green-700 bg-green-50',
};

export default function AssignmentModal({ initialDate, initialEmployeeId, catalog, onClose, onSaved }) {
  const [date, setDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [employees, setEmployees] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState(initialEmployeeId || '');
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [recurrenceType, setRecurrenceType] = useState('única');
  const [recurrenceDays, setRecurrenceDays] = useState([]);
  const [saving, setSaving] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');

  // Cargar usuarios con info de turno cuando cambia la fecha
  useEffect(() => {
    if (!date) return;
    setLoadingEmps(true);
    api.get(`/tasks/employees-by-date?date=${date}`)
      .then(r => setEmployees(r.data))
      .catch(() => {})
      .finally(() => setLoadingEmps(false));
  }, [date]);

  const toggleDay = (val) => {
    setRecurrenceDays(prev =>
      prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val].sort((a, b) => a - b)
    );
  };

  const filteredCatalog = catalog.filter(t =>
    t.title.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!selectedEmpId) { toast.error('Selecciona un usuario'); return; }
    if (!selectedCatalogId) { toast.error('Selecciona una tarea del catálogo'); return; }
    if (recurrenceType === 'semanal' && recurrenceDays.length === 0) {
      toast.error('Selecciona al menos un día de la semana'); return;
    }

    setSaving(true);
    try {
      await api.post('/tasks/assignments', {
        catalog_id: selectedCatalogId,
        employee_id: selectedEmpId,
        recurrence_type: recurrenceType,
        recurrence_days: recurrenceDays,
        start_date: date,
      });
      toast.success('Tarea asignada correctamente');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al asignar');
    } finally {
      setSaving(false);
    }
  };

  const selectedCatalogTask = catalog.find(t => t.id === selectedCatalogId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg text-gray-900">Asignar tarea</h3>
            <p className="text-xs text-gray-400">Los usuarios con turno se muestran primero</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* 1. Fecha */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              📅 Fecha de inicio
            </label>
            <input
              type="date"
              className="input w-48"
              value={date}
              onChange={e => { setDate(e.target.value); setSelectedEmpId(''); }}
            />
          </div>

          {/* 2. Usuario */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              👤 Usuario
              {loadingEmps && <span className="ml-2 text-xs font-normal text-gray-400">cargando...</span>}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {employees.map(emp => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => setSelectedEmpId(emp.id)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${
                    selectedEmpId === emp.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    selectedEmpId === emp.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm font-medium truncate ${selectedEmpId === emp.id ? 'text-blue-900' : 'text-gray-800'}`}>
                      {emp.name}
                    </div>
                    {emp.has_schedule
                      ? <span className="text-xs text-green-600 font-medium">✓ Trabaja ese día</span>
                      : <span className="text-xs text-gray-400">Sin turno asignado</span>
                    }
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Tarea del catálogo */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              📋 Tarea del catálogo
            </label>
            <input
              type="text"
              className="input mb-2"
              placeholder="Buscar tarea..."
              value={catalogSearch}
              onChange={e => setCatalogSearch(e.target.value)}
            />
            {filteredCatalog.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-3">No hay tareas en el catálogo</p>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                {filteredCatalog.map((task, idx) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedCatalogId(task.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      selectedCatalogId === task.id
                        ? 'bg-blue-600 text-white'
                        : idx % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'
                    } ${idx > 0 ? 'border-t border-gray-100' : ''}`}
                  >
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      selectedCatalogId === task.id ? 'bg-white/20 text-white' : PRIORITY_COLOR[task.priority]
                    }`}>
                      {task.priority}
                    </span>
                    <span className="text-sm font-medium truncate">{task.title}</span>
                    {selectedCatalogId === task.id && <span className="ml-auto shrink-0">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 4. Recurrencia */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              🔁 Repetición
            </label>
            <div className="flex gap-2 mb-3">
              {[
                { value: 'única', label: 'Una vez' },
                { value: 'diaria', label: 'Diaria' },
                { value: 'semanal', label: 'Semanal' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setRecurrenceType(opt.value); setRecurrenceDays([]); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    recurrenceType === opt.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {recurrenceType === 'semanal' && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Selecciona los días:</p>
                <div className="flex gap-2">
                  {DAYS.map(d => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={`w-9 h-9 rounded-full text-sm font-bold transition-colors ${
                        recurrenceDays.includes(d.value)
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Resumen de la asignación */}
          {selectedEmpId && selectedCatalogTask && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm">
              <p className="font-medium text-blue-900 mb-0.5">Resumen:</p>
              <p className="text-blue-700">
                <strong>{employees.find(e => e.id === selectedEmpId)?.name}</strong> →{' '}
                <strong>{selectedCatalogTask.title}</strong>
              </p>
              <p className="text-blue-600 text-xs mt-0.5">
                {recurrenceType === 'única' && `Solo el ${date}`}
                {recurrenceType === 'diaria' && `Todos los días desde el ${date}`}
                {recurrenceType === 'semanal' && recurrenceDays.length > 0 &&
                  `Cada ${['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].filter((_, i) => recurrenceDays.includes(i)).join(', ')} desde el ${date}`
                }
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex gap-3 shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !selectedEmpId || !selectedCatalogId}
            className="btn-primary flex-1"
          >
            {saving ? 'Asignando...' : '✅ Asignar tarea'}
          </button>
        </div>
      </div>
    </div>
  );
}
