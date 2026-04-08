import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatMXN(v) {
  return Number(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
}

function formatDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function DiffBadge({ diff }) {
  const abs = Math.abs(diff);
  if (abs === 0) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">$0.00</span>;
  if (abs <= 100) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">{diff > 0 ? '+' : '-'}${formatMXN(abs)}</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{diff > 0 ? '+' : '-'}${formatMXN(abs)}</span>;
}

function ReliabilityBadge({ count }) {
  if (count < 5) return <span className="text-xs text-gray-400">🔘 Sin datos</span>;
  if (count < 15) return <span className="text-xs text-yellow-600">🟡 Baja ({count})</span>;
  if (count < 30) return <span className="text-xs text-orange-600">🟠 Media ({count})</span>;
  return <span className="text-xs text-green-600">🟢 Alta ({count})</span>;
}

// ── Tab: Lista ────────────────────────────────────────────────────────────────
function TabLista({ employees }) {
  const today = new Date().toISOString().split('T')[0];
  const [filters, setFilters] = useState({ employee_id: '', register: '', shift_label: '', from: today, to: today });
  const [cuts, setCuts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/cuts', { params: filters });
      setCuts(res.data);
    } catch { toast.error('Error al cargar cortes'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    try {
      const res = await api.get('/cuts/report', { params: filters, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `cortes_${filters.from}_${filters.to}.xlsx`; a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Error al exportar'); }
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
          <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
            className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
          <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
            className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
          <select value={filters.employee_id} onChange={e => setFilters(f => ({ ...f, employee_id: e.target.value }))}
            className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Caja</label>
          <select value={filters.register} onChange={e => setFilters(f => ({ ...f, register: e.target.value }))}
            className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas</option>
            <option value="Caja 1">Caja 1</option>
            <option value="Caja 2">Caja 2</option>
            <option value="Caja 3">Caja 3</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Turno</label>
          <select value={filters.shift_label || ''} onChange={e => setFilters(f => ({ ...f, shift_label: e.target.value }))}
            className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos</option>
            <option value="Mañana">Mañana</option>
            <option value="Tarde">Tarde</option>
          </select>
        </div>
        <button onClick={handleExport} className="ml-auto flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700">
          📥 Exportar .xlsx
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>
      ) : cuts.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-8">Sin cortes en el período seleccionado</p>
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                {['Fecha','Usuario','Caja','Turno','Ventas','Tarjeta','Ef. Esperado','Ef. Declarado','Diferencia'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cuts.map(cut => (
                <tr key={cut.id}
                  onClick={() => setSelected(cut)}
                  className={`border-b cursor-pointer hover:bg-gray-50 ${cut.is_anomaly ? 'bg-amber-50' : ''}`}>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(cut.shift_date)}</td>
                  <td className="px-4 py-3 font-medium">{cut.employee_name}</td>
                  <td className="px-4 py-3">{cut.register_name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cut.shift_label === 'Mañana' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                      {cut.shift_label || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">${formatMXN(cut.total_sales)}</td>
                  <td className="px-4 py-3">${formatMXN(cut.card_payments)}</td>
                  <td className="px-4 py-3">${formatMXN(cut.expected_cash)}</td>
                  <td className="px-4 py-3">${formatMXN(cut.declared_cash)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <DiffBadge diff={cut.cash_difference} />
                      {cut.is_anomaly ? <span title={`Anomalía: ${cut.deviation_pct}% desviación`}>⚠️</span> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal detalle */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">Detalle del corte</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Usuario', selected.employee_name],
                ['Caja', selected.register_name],
                ['Fecha', formatDate(selected.shift_date)],
                ['Turno', selected.shift_label || '—'],
                ['Horario', selected.start_time ? `${selected.start_time}–${selected.end_time}` : '—'],
                ['Ventas totales', `$${formatMXN(selected.total_sales)}`],
                ['Pagos tarjeta', `$${formatMXN(selected.card_payments)}`],
                ['Ef. esperado', `$${formatMXN(selected.expected_cash)}`],
                ['Ef. declarado', `$${formatMXN(selected.declared_cash)}`],
                ['Diferencia', `${selected.cash_difference >= 0 ? '+' : ''}$${formatMXN(selected.cash_difference)}`],
              ].map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-lg p-2">
                  <dt className="text-xs text-gray-500">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {selected.notes && (
              <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">📝 {selected.notes}</p>
            )}
            {selected.is_anomaly ? (
              <div className="mt-3 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                ⚠️ Anomalía detectada · desviación {selected.deviation_pct}%
              </div>
            ) : null}
            <p className="text-xs text-gray-400 mt-3">
              Registrado: {new Date(selected.submitted_at).toLocaleString('es-MX')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Alertas ──────────────────────────────────────────────────────────────
function TabAlertas() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | unseen | missing_cut | anomaly_detected

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === 'unseen') params.is_seen = false;
      else if (filter === 'missing_cut' || filter === 'anomaly_detected') params.type = filter;
      const res = await api.get('/cuts/alerts', { params });
      setAlerts(res.data);
    } catch { toast.error('Error al cargar alertas'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const markSeen = async (id) => {
    await api.patch(`/cuts/alerts/${id}/seen`);
    setAlerts(a => a.map(x => x.id === id ? { ...x, is_seen: 1 } : x));
  };

  const markAllSeen = async () => {
    await api.patch('/cuts/alerts/seen-all');
    setAlerts(a => a.map(x => ({ ...x, is_seen: 1 })));
    toast.success('Todas las alertas marcadas como vistas');
  };

  const unseenCount = alerts.filter(a => !a.is_seen).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {[['all','Todas'],['unseen','No vistas'],['missing_cut','Cortes faltantes'],['anomaly_detected','Anomalías']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === v ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>
        {unseenCount > 0 && (
          <button onClick={markAllSeen} className="ml-auto text-xs text-blue-600 hover:underline">
            Marcar todas como vistas ({unseenCount})
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>
      ) : alerts.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-8">Sin alertas</p>
      ) : (
        <div className="space-y-3">
          {alerts.map(a => (
            <div key={a.id} className={`rounded-xl border p-4 ${a.is_seen ? 'bg-white opacity-60' : a.alert_type === 'missing_cut' ? 'bg-orange-50 border-orange-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-xl">{a.alert_type === 'missing_cut' ? '🕐' : '⚠️'}</span>
                  <div>
                    <p className="font-semibold text-gray-800">
                      {a.alert_type === 'missing_cut' ? 'Corte no capturado' : 'Anomalía detectada'}
                      {!a.is_seen ? <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Nueva</span> : null}
                    </p>
                    <p className="text-sm text-gray-600">{a.employee_name} · Turno {a.start_time}–{a.end_time}</p>
                    <p className="text-xs text-gray-500">{formatDate(a.shift_date)} · {new Date(a.created_at).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })}</p>
                    {a.alert_type === 'anomaly_detected' && a.deviation_pct !== null && (
                      <p className="text-sm text-amber-700 mt-1">
                        Desviación: <strong>{a.deviation_pct}%</strong> · Promedio ref.: ${formatMXN(a.avg_reference)}
                        {' · '}<ReliabilityBadge count={a.sample_count || 0} />
                      </p>
                    )}
                  </div>
                </div>
                {!a.is_seen && (
                  <button onClick={() => markSeen(a.id)} className="text-xs text-blue-600 hover:underline shrink-0">
                    Marcar vista
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Promedios ────────────────────────────────────────────────────────────
function TabPromedios() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const DAY_NAMES = { 1:'Lun', 2:'Mar', 3:'Mié', 4:'Jue', 5:'Vie', 6:'Sáb', 7:'Dom' };

  useEffect(() => {
    api.get('/cuts/baselines')
      .then(r => setData(r.data))
      .catch(() => toast.error('Error al cargar promedios'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>;
  if (!data.length) return <p className="text-center text-gray-400 text-sm py-8">Sin datos históricos aún. Los promedios se construyen automáticamente con cada corte registrado.</p>;

  // Agrupar por usuario
  const grouped = {};
  for (const row of data) {
    const key = row.employee_id;
    if (!grouped[key]) grouped[key] = { employee_name: row.employee_name, rows: [] };
    grouped[key].rows.push(row);
  }

  return (
    <div className="space-y-4">
      {Object.values(grouped).map(emp => (
        <div key={emp.employee_name} className="bg-white border rounded-xl overflow-x-auto">
          <div className="px-4 py-3 border-b">
            <p className="font-semibold text-gray-800">{emp.employee_name}</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-2 font-medium text-gray-600">Caja</th>
                {[1,2,3,4,5,6,7].map(d => (
                  <th key={d} className="text-center px-3 py-2 font-medium text-gray-600">{DAY_NAMES[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...new Set(emp.rows.map(r => r.register_name))].map(reg => {
                const byDay = {};
                emp.rows.filter(r => r.register_name === reg).forEach(r => { byDay[r.day_of_week] = r; });
                return (
                  <tr key={reg} className="border-b">
                    <td className="px-4 py-3 font-medium text-gray-700">{reg}</td>
                    {[1,2,3,4,5,6,7].map(d => (
                      <td key={d} className="px-3 py-3 text-center">
                        {byDay[d] ? (
                          <div>
                            <div className="font-medium text-gray-800">${formatMXN(byDay[d].avg_total_sales)}</div>
                            <div className="mt-0.5"><ReliabilityBadge count={byDay[d].sample_count} /></div>
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Tendencias (gráfica simple sin Recharts) ─────────────────────────────
function TabTendencias({ employees }) {
  const [filters, setFilters] = useState({ period: 'week', employee_id: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/cuts/trends', { params: filters });
      setData(res.data);
    } catch { toast.error('Error al cargar tendencias'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const filterControls = (
    <div className="flex gap-3 flex-wrap">
      <select value={filters.period} onChange={e => setFilters(f => ({ ...f, period: e.target.value }))}
        className="border rounded-lg px-2 py-1.5 text-sm">
        <option value="week">Última semana</option>
        <option value="month">Último mes</option>
      </select>
      <select value={filters.employee_id} onChange={e => setFilters(f => ({ ...f, employee_id: e.target.value }))}
        className="border rounded-lg px-2 py-1.5 text-sm">
        <option value="">Todos los usuarios</option>
        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
    </div>
  );

  if (loading) return <div className="space-y-4">{filterControls}<div className="text-center py-8 text-gray-400 text-sm">Cargando...</div></div>;
  if (!data?.cuts?.length) return (
    <div className="space-y-4">
      {filterControls}
      <p className="text-center text-gray-400 text-sm py-8">Sin datos en el período</p>
    </div>
  );

  // Calcular maxSales para la barra proporcional
  const maxSales = Math.max(...data.cuts.map(c => c.total_sales), 1);

  return (
    <div className="space-y-4">
      {filterControls}

      <div className="bg-white border rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-700 mb-4">Ventas por turno ({data.from} a {data.to})</p>
        <div className="space-y-3">
          {data.cuts.map(cut => (
            <div key={cut.id}>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>{formatDate(cut.shift_date)} · {cut.employee_name} · {cut.register_name}</span>
                <div className="flex items-center gap-1">
                  <span className="font-semibold">${formatMXN(cut.total_sales)}</span>
                  {cut.is_anomaly ? <span title={`Anomalía ${cut.deviation_pct}%`}>⚠️</span> : null}
                </div>
              </div>
              <div className="flex-1 bg-gray-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${cut.is_anomaly ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${(cut.total_sales / maxSales) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Cortes() {
  const [tab, setTab] = useState('lista');
  const [summary, setSummary] = useState(null);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    api.get('/cuts/summary').then(r => setSummary(r.data)).catch(() => {});
    api.get('/employees').then(r => setEmployees(r.data)).catch(() => {});
  }, []);

  const tabs = [
    { id: 'lista',    label: 'Lista' },
    { id: 'alertas',  label: `Alertas${summary?.unseen_alerts ? ` (${summary.unseen_alerts})` : ''}` },
    { id: 'promedios', label: 'Promedios' },
    { id: 'tendencias', label: 'Tendencias' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Cortes de Caja</h1>
        <p className="text-sm text-gray-500 mt-0.5">Registro y análisis de cierres de caja por turno</p>
      </div>

      {/* Barra de resumen */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Cortes hoy', value: summary.total_cuts, icon: '🧾' },
            { label: 'Ventas totales', value: `$${formatMXN(summary.total_sales)}`, icon: '💰' },
            { label: 'Pendientes hoy', value: summary.pending_cuts, icon: '🕐', warn: summary.pending_cuts > 0 },
            { label: 'Alertas nuevas', value: summary.unseen_alerts, icon: '⚠️', warn: summary.unseen_alerts > 0 },
          ].map(({ label, value, icon, warn }) => (
            <div key={label} className={`rounded-xl border p-4 ${warn ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
              <p className="text-xs text-gray-500 font-medium">{icon} {label}</p>
              <p className={`text-xl font-bold mt-1 ${warn ? 'text-amber-700' : 'text-gray-800'}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'lista' && <TabLista employees={employees} />}
        {tab === 'alertas' && <TabAlertas />}
        {tab === 'promedios' && <TabPromedios />}
        {tab === 'tendencias' && <TabTendencias employees={employees} />}
      </div>
    </div>
  );
}
