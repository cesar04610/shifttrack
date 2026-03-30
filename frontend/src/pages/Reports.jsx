import { useEffect, useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function Reports() {
  const [start, setStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [end, setEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('resumen');

  useEffect(() => {
    api.get('/employees').then(r => setEmployees(r.data));
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sumRes, recRes] = await Promise.all([
        api.get(`/reports/summary?start=${start}&end=${end}`),
        api.get(`/reports/attendance?start=${start}&end=${end}${employeeId ? `&employee_id=${employeeId}` : ''}`),
      ]);
      setSummary(sumRes.data);
      setRecords(recRes.data);
    } catch {
      toast.error('Error al cargar reportes');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const url = `/api/reports/export?start=${start}&end=${end}${employeeId ? `&employee_id=${employeeId}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `reporte_${start}_${end}.xlsx`;
      a.click();
      toast.success('Reporte exportado');
    } catch {
      toast.error('Error al exportar');
    }
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '—';
    return format(new Date(isoStr), 'HH:mm');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Reportes</h2>
        <button onClick={handleExport} className="btn btn-sm bg-green-600 text-white hover:bg-green-700 focus:ring-green-500">
          📥 Exportar Excel
        </button>
      </div>

      {/* Filtros */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input type="date" className="input w-40" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input type="date" className="input w-40" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <select className="input w-44" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">Todos</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <button onClick={fetchData} disabled={loading} className="btn-primary btn-sm">
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('resumen')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'resumen' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>Resumen</button>
        <button onClick={() => setTab('detalle')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'detalle' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>Detalle</button>
      </div>

      {tab === 'resumen' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Usuario</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Días trabajados</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Horas totales</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Sin salida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.length === 0 && (
                <tr><td colSpan={4} className="text-center text-gray-400 py-8">Sin datos en este período</td></tr>
              )}
              {summary.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-center">{s.total_dias}</td>
                  <td className="px-4 py-3 text-center font-semibold text-blue-700">{s.total_horas} h</td>
                  <td className="px-4 py-3 text-center">
                    {s.dias_sin_salida > 0 ? <span className="badge-yellow">{s.dias_sin_salida}</span> : <span className="badge-green">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'detalle' && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Usuario</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Turno</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Entrada</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Salida</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Horas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-8">Sin registros en este período</td></tr>
                )}
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium">{r.employee_name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.date}</td>
                    <td className="px-4 py-2.5 text-center text-gray-500">
                      {r.scheduled_start ? `${r.scheduled_start}–${r.scheduled_end}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center">{formatTime(r.clock_in)}</td>
                    <td className="px-4 py-2.5 text-center">{formatTime(r.clock_out)}</td>
                    <td className="px-4 py-2.5 text-center font-medium">
                      {r.hours_worked !== null ? `${r.hours_worked} h` : <span className="badge-yellow">Activo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
