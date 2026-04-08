import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const DAY_NAMES = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom' };

function formatMXN(value) {
  return Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dt) {
  return new Date(dt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dt) {
  return new Date(dt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Barra visual simple (sin librería externa)
function Bar({ value, max, color = 'bg-blue-500' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Pestaña: Gasto ────────────────────────────────────────────────────────────
function TabGasto({ from, to }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    api.get('/analytics/spending', { params: { from, to } })
      .then(r => setData(r.data))
      .catch(() => toast.error('Error al cargar datos de gasto'))
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>;
  if (!data) return null;

  const maxDay = Math.max(...(data.byDay || []).map(d => d.total), 1);
  const maxSupplier = Math.max(...(data.bySupplier || []).map(s => s.total), 1);

  return (
    <div className="space-y-6">
      {/* Total */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-center gap-4">
        <div className="text-4xl">💰</div>
        <div>
          <p className="text-sm text-blue-600 font-medium">Total pagado en el período</p>
          <p className="text-3xl font-bold text-blue-800">${formatMXN(data.total)}</p>
          <p className="text-xs text-blue-500 mt-0.5">
            {data.bySupplier?.length || 0} proveedores · {data.byDay?.reduce((a, d) => a + d.ticket_count, 0) || 0} tickets
          </p>
        </div>
      </div>

      {/* Gasto por día */}
      {data.byDay?.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Gasto por día</h3>
          <div className="space-y-2">
            {data.byDay.map(d => (
              <div key={d.day}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{formatDate(d.day + 'T12:00:00')}</span>
                  <span className="font-medium">${formatMXN(d.total)}</span>
                </div>
                <Bar value={d.total} max={maxDay} color="bg-blue-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ranking por proveedor */}
      {data.bySupplier?.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Gasto por proveedor</h3>
          <div className="space-y-3">
            {data.bySupplier.map((s, i) => (
              <div key={s.id}>
                <div className="flex justify-between text-sm mb-1">
                  <div>
                    <span className="text-gray-500 font-medium mr-2">#{i + 1}</span>
                    <span className="font-medium text-gray-800">{s.company_name}</span>
                    <span className="text-xs text-gray-400 ml-2">· {s.ticket_count} tickets</span>
                  </div>
                  <span className="font-semibold">${formatMXN(s.total)}</span>
                </div>
                <Bar value={s.total} max={maxSupplier} color="bg-indigo-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      {data.byDay?.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-6">Sin tickets en el período seleccionado</p>
      )}
    </div>
  );
}

// ── Pestaña: Promedios ────────────────────────────────────────────────────────
function TabPromedios() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics/supplier-avg')
      .then(r => setData(r.data))
      .catch(() => toast.error('Error al cargar promedios'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>;
  if (!data?.length) return <p className="text-center text-gray-400 text-sm py-6">Sin datos históricos aún</p>;

  const days = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="bg-white rounded-xl border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b">
            <th className="text-left px-4 py-3 font-semibold text-gray-700">Proveedor</th>
            {days.map(d => (
              <th key={d} className="text-center px-2 py-3 font-semibold text-gray-600 whitespace-nowrap">
                {DAY_NAMES[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(s => (
            <tr key={s.supplier_id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">{s.company_name}</td>
              {days.map(d => (
                <td key={d} className="px-2 py-3 text-center text-gray-600">
                  {s.averages[d] !== undefined ? (
                    <div>
                      <div className="font-medium">${formatMXN(s.averages[d])}</div>
                      <div className="text-xs text-gray-400">({s.counts[d]})</div>
                    </div>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 px-4 py-2">Los números entre paréntesis indican la cantidad de tickets</p>
    </div>
  );
}

// ── Cuadres: helpers de timeline ──────────────────────────────────────────────
function buildTimeline(session) {
  const events = [];
  for (const t of session.tickets || [])
    events.push({ time: t.registered_at, type: t.is_voided ? 'ticket_void' : 'ticket', ...t });
  for (const a of session.additions || [])
    events.push({ time: a.added_at, type: 'addition', ...a });
  for (const sc of session.shift_changes || [])
    events.push({ time: sc.changed_at, type: 'shift_change', ...sc });
  for (const se of session.shiftEnds || [])
    events.push({ time: se.ended_at, type: 'shift_end', ...se });

  events.sort((a, b) => new Date(a.time) - new Date(b.time));

  let balance = session.initial_balance;
  return events.map(ev => {
    if (ev.type === 'ticket')   balance -= ev.amount;
    if (ev.type === 'addition') balance += ev.amount;
    return { ...ev, balance_after: balance };
  });
}

function diffColor(diff) {
  if (diff === null || diff === undefined) return '';
  if (diff < 0) return 'text-red-600';
  if (diff > 0) return 'text-blue-600';
  return 'text-green-600';
}

function TimelineRow({ ev }) {
  const time = new Date(ev.time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  if (ev.type === 'ticket') {
    return (
      <div className="flex items-start justify-between py-1.5 text-xs border-b border-gray-100">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-gray-400 shrink-0">{time}</span>
          <span className="text-red-400 shrink-0">💸</span>
          <div className="min-w-0">
            <span className="font-medium text-gray-800">{ev.supplier_name}</span>
            <span className="text-gray-400 ml-1">· {ev.employee_name}</span>
            {ev.note && <span className="text-gray-400 ml-1">· {ev.note}</span>}
          </div>
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className="font-semibold text-red-600">-${formatMXN(ev.amount)}</p>
          <p className="text-gray-400">${formatMXN(ev.balance_after)}</p>
        </div>
      </div>
    );
  }

  if (ev.type === 'ticket_void') {
    return (
      <div className="flex items-start justify-between py-1.5 text-xs border-b border-gray-100 opacity-50">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-gray-400 shrink-0">{time}</span>
          <span className="shrink-0">❌</span>
          <div className="min-w-0">
            <span className="line-through text-gray-500">{ev.supplier_name}</span>
            <span className="text-gray-400 ml-1">Anulado</span>
            {ev.void_reason && <span className="text-gray-400 ml-1">· {ev.void_reason}</span>}
          </div>
        </div>
        <p className="text-gray-400 shrink-0 ml-3">-${formatMXN(ev.amount)}</p>
      </div>
    );
  }

  if (ev.type === 'addition') {
    return (
      <div className="flex items-start justify-between py-1.5 text-xs border-b border-gray-100">
        <div className="flex items-start gap-2">
          <span className="text-gray-400 shrink-0">{time}</span>
          <span className="shrink-0">➕</span>
          <span className="font-medium text-gray-800">Adición de saldo <span className="font-normal text-gray-400">· {ev.user_name}</span></span>
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className="font-semibold text-green-600">+${formatMXN(ev.amount)}</p>
          <p className="text-gray-400">${formatMXN(ev.balance_after)}</p>
        </div>
      </div>
    );
  }

  if (ev.type === 'shift_change') {
    return (
      <div className="py-2 border-b border-blue-100 bg-blue-50 rounded px-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 shrink-0">{time}</span>
            <span>🔄</span>
            <span className="font-medium text-blue-800">
              {ev.outgoing_name} → {ev.incoming_name}
            </span>
          </div>
          {ev.difference_at_change !== null && (
            <span className={`font-semibold shrink-0 ml-3 ${diffColor(ev.difference_at_change)}`}>
              {ev.difference_at_change >= 0 ? '+' : ''}${formatMXN(ev.difference_at_change)}
            </span>
          )}
        </div>
        <div className="mt-1 flex gap-4 text-gray-500 pl-6">
          <span>Esperado: ${formatMXN(ev.expected_at_change)}</span>
          {ev.cash_at_change !== null && <span>Declarado: ${formatMXN(ev.cash_at_change)}</span>}
        </div>
      </div>
    );
  }

  if (ev.type === 'shift_end') {
    return (
      <div className="py-2 border-b border-orange-100 bg-orange-50 rounded px-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 shrink-0">{time}</span>
            <span>🔒</span>
            <span className="font-medium text-orange-800">Cierre de turno · {ev.user_name}</span>
          </div>
          <span className={`font-semibold shrink-0 ml-3 ${diffColor(ev.difference)}`}>
            {ev.difference >= 0 ? '+' : ''}${formatMXN(ev.difference)}
          </span>
        </div>
        <div className="mt-1 flex gap-4 text-gray-500 pl-6">
          <span>Esperado: ${formatMXN(ev.expected_balance)}</span>
          <span>Declarado: ${formatMXN(ev.declared_balance)}</span>
        </div>
      </div>
    );
  }

  return null;
}

function SessionCard({ session }) {
  const [expanded, setExpanded] = useState(false);
  const timeline = buildTimeline(session);
  const totalTickets = (session.tickets || []).filter(t => !t.is_voided).length;
  const totalSpent   = (session.tickets || []).filter(t => !t.is_voided).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <span className="font-semibold text-gray-800">{session.session_date}</span>
            <span className="text-xs text-gray-400 ml-2">
              Abierto por {session.opened_by_name}
              {session.closed_by_name && ` · Cerrado por ${session.closed_by_name}`}
            </span>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            session.closed_at ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>
            {session.closed_at ? 'Cerrado' : 'Abierto'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-xs text-gray-500">Saldo inicial</p>
            <p className="font-semibold">${formatMXN(session.initial_balance)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-xs text-gray-500">Total pagado</p>
            <p className="font-semibold text-red-600">-${formatMXN(totalSpent)}</p>
            <p className="text-xs text-gray-400">{totalTickets} ticket{totalTickets !== 1 ? 's' : ''}</p>
          </div>
          {session.expected_balance !== null && (
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="text-xs text-gray-500">Saldo esperado</p>
              <p className="font-semibold">${formatMXN(session.expected_balance)}</p>
            </div>
          )}
          {session.real_balance !== null && (
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="text-xs text-gray-500">Saldo declarado</p>
              <p className="font-semibold">${formatMXN(session.real_balance)}</p>
            </div>
          )}
          {session.cash_difference !== null && (
            <div className={`rounded-lg p-2 col-span-2 ${
              session.cash_difference < 0 ? 'bg-red-50' : session.cash_difference > 0 ? 'bg-blue-50' : 'bg-green-50'
            }`}>
              <p className="text-xs text-gray-500">Diferencia final</p>
              <p className={`font-bold ${diffColor(session.cash_difference)}`}>
                {session.cash_difference >= 0 ? '+' : ''}${formatMXN(session.cash_difference)}
              </p>
            </div>
          )}
        </div>

        {timeline.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {expanded ? '▲ Ocultar movimientos' : `▼ Ver ${timeline.length} movimiento${timeline.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t bg-gray-50 px-5 py-3">
          <div className="flex items-center justify-between text-xs text-gray-500 py-1.5 border-b border-gray-200 mb-1">
            <div className="flex items-center gap-2">
              <span>🏦</span>
              <span className="font-medium">Saldo inicial · {session.opened_by_name}</span>
            </div>
            <span className="font-semibold text-gray-700">${formatMXN(session.initial_balance)}</span>
          </div>
          <div className="space-y-0.5">
            {timeline.map((ev, i) => <TimelineRow key={i} ev={ev} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pestaña: Cuadres de caja ──────────────────────────────────────────────────
function TabCuadres({ from, to }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/analytics/cash-audits', { params: { from, to } })
      .then(r => setData(r.data))
      .catch(() => toast.error('Error al cargar cuadres'))
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>;
  if (!data?.length) return <p className="text-center text-gray-400 text-sm py-6">Sin cuadres en el período</p>;

  return (
    <div className="space-y-4">
      {data.map(session => <SessionCard key={session.id} session={session} />)}
    </div>
  );
}

// ── Pestaña: Alertas ──────────────────────────────────────────────────────────
function TabAlertas({ from, to }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/analytics/alerts', { params: { from, to } })
      .then(r => setData(r.data))
      .catch(() => toast.error('Error al cargar alertas'))
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>;
  if (!data?.length) return <p className="text-center text-gray-400 text-sm py-6">Sin alertas en el período</p>;

  return (
    <div className="space-y-3">
      {data.map(alert => (
        <div key={alert.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-semibold text-gray-800">{alert.company_name}</p>
                <p className="text-sm text-gray-600">
                  Monto: <strong>${formatMXN(alert.ticket_amount)}</strong>
                  {' · '}Promedio ({DAY_NAMES[alert.day_of_week]}): ${formatMXN(alert.historical_avg)}
                </p>
                <p className="text-sm text-amber-700 font-medium">
                  Desviación: +{alert.deviation_pct}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Registrado por {alert.employee_name} · {formatDateTime(alert.created_at)}
                  {alert.email_sent ? ' · ✉️ Email enviado' : ''}
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ProveedoresAnalytics() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState('gasto');
  const [exporting, setExporting] = useState(false);

  const tabs = [
    { id: 'gasto',     label: 'Gasto' },
    { id: 'promedios', label: 'Promedios' },
    { id: 'cuadres',   label: 'Cuadres' },
    { id: 'alertas',   label: 'Alertas' },
  ];

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/analytics/export', {
        params: { from, to },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `proveedores_${from}_${to}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Análisis de Proveedores</h1>
          <p className="text-sm text-gray-500 mt-0.5">Métricas de compras y comportamiento de gasto</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {exporting ? 'Exportando...' : '📥 Exportar .xlsx'}
        </button>
      </div>

      {/* Selector de fechas */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Desde:</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Hasta:</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Atajos de rango */}
        <div className="flex gap-2">
          {[
            { label: 'Hoy', days: 0 },
            { label: '7 días', days: 7 },
            { label: '30 días', days: 30 },
            { label: '90 días', days: 90 },
          ].map(({ label, days }) => (
            <button
              key={label}
              onClick={() => {
                const t = new Date().toISOString().split('T')[0];
                const f = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                setFrom(days === 0 ? t : f);
                setTo(t);
              }}
              className="text-xs px-2 py-1 border rounded-md text-gray-600 hover:bg-gray-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido de la pestaña activa */}
      <div>
        {tab === 'gasto'     && <TabGasto from={from} to={to} />}
        {tab === 'promedios' && <TabPromedios />}
        {tab === 'cuadres'   && <TabCuadres from={from} to={to} />}
        {tab === 'alertas'   && <TabAlertas from={from} to={to} />}
      </div>
    </div>
  );
}
