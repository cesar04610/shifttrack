import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const DAY_NAMES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function formatDateTime(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function formatMXN(v) {
  return Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Tab 1: Alertas Recientes ─────────────────────────────────────────────────
function TabAlertas() {
  const [ticketAlerts, setTicketAlerts] = useState([]);
  const [cutAlerts, setCutAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ta, ca] = await Promise.all([
        api.get('/tickets/alerts'),
        api.get('/cuts/alerts'),
      ]);
      setTicketAlerts(ta.data.map(a => ({ ...a, _type: 'ticket' })));
      setCutAlerts(ca.data.map(a => ({ ...a, _type: 'cut' })));
    } catch {
      toast.error('Error al cargar alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const combined = [...ticketAlerts, ...cutAlerts].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  const markSeen = async (alert) => {
    try {
      if (alert._type === 'ticket') {
        await api.patch(`/tickets/alerts/${alert.id}/seen`);
        setTicketAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, is_seen: 1 } : a));
      } else {
        await api.patch(`/cuts/alerts/${alert.id}/seen`);
        setCutAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, is_seen: 1 } : a));
      }
    } catch {
      toast.error('Error al marcar alerta');
    }
  };

  const markAllSeen = async () => {
    setMarkingAll(true);
    try {
      await Promise.all([
        api.patch('/tickets/alerts/seen-all'),
        api.patch('/cuts/alerts/seen-all'),
      ]);
      await load();
      toast.success('Todas las alertas marcadas como vistas');
    } catch {
      toast.error('Error al marcar alertas');
    } finally {
      setMarkingAll(false);
    }
  };

  const unseen = combined.filter(a => !a.is_seen).length;

  if (loading) return <div className="text-gray-400 py-10 text-center">Cargando alertas...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-500">Últimos 7 días — {combined.length} alertas</p>
          {unseen > 0 && (
            <p className="text-sm font-medium text-amber-600">{unseen} sin ver</p>
          )}
        </div>
        {unseen > 0 && (
          <button
            onClick={markAllSeen}
            disabled={markingAll}
            className="px-3 py-1.5 text-sm border rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {markingAll ? 'Marcando...' : 'Marcar todo como visto'}
          </button>
        )}
      </div>

      {combined.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-medium">Sin alertas en los últimos 7 días</p>
        </div>
      ) : (
        <div className="space-y-3">
          {combined.map(alert => (
            <div
              key={`${alert._type}-${alert.id}`}
              className={`border rounded-xl p-4 transition-colors ${alert.is_seen ? 'bg-white' : 'bg-amber-50 border-amber-200'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-xl mt-0.5">{alert._type === 'ticket' ? '🛒' : '🏦'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        alert._type === 'ticket'
                          ? 'bg-amber-100 text-amber-700'
                          : alert.alert_type === 'anomaly_detected'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-blue-100 text-blue-700'
                      }`}>
                        {alert._type === 'ticket' ? 'Ticket Proveedor' : alert.alert_type === 'anomaly_detected' ? 'Anomalía Corte' : 'Corte Faltante'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${alert.is_seen ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {alert.is_seen ? 'Visto' : 'Pendiente'}
                      </span>
                    </div>

                    {alert._type === 'ticket' ? (
                      <div className="mt-1.5">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {alert.supplier_name}
                          <span className="text-gray-500 font-normal"> — por {alert.employee_name}</span>
                        </p>
                        <p className="text-sm text-gray-600">
                          Monto: <strong>${formatMXN(alert.ticket_amount)}</strong>
                          {' '}· Promedio {DAY_NAMES[alert.day_of_week]}: ${formatMXN(alert.historical_avg)}
                          {' '}· Desviación: <strong className="text-red-600">+{alert.deviation_pct}%</strong>
                        </p>
                      </div>
                    ) : (
                      <div className="mt-1.5">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {alert.employee_name || '—'}
                        </p>
                        {alert.deviation_pct != null && (
                          <p className="text-sm text-gray-600">
                            Desviación: <strong className="text-red-600">+{Number(alert.deviation_pct).toFixed(1)}%</strong>
                            {alert.avg_reference != null && ` · Referencia: $${formatMXN(alert.avg_reference)}`}
                          </p>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-gray-400 mt-1">{formatDateTime(alert.created_at)}</p>
                  </div>
                </div>

                {!alert.is_seen && (
                  <button
                    onClick={() => markSeen(alert)}
                    className="text-xs px-2.5 py-1 border rounded-lg text-gray-600 hover:bg-gray-100 whitespace-nowrap"
                  >
                    Marcar visto
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

// ─── Tab 2: Configuración de Correo ──────────────────────────────────────────
function TabCorreo() {
  const [config, setConfig] = useState({ host: 'smtp.gmail.com', port: 587, user_email: '', pass_set: false, from_name: 'Mostrador Modelorama', active: 0 });
  const [newPass, setNewPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [absenceConfig, setAbsenceConfig] = useState({ tolerance_minutes: 15, email_active: 1 });
  const [savingAbsence, setSavingAbsence] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/alerts/email-config'),
      api.get('/reports/alert-config'),
    ]).then(([ec, ac]) => {
      setConfig(ec.data);
      setAbsenceConfig(ac.data);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/alerts/email-config', {
        host: config.host,
        port: config.port,
        user_email: config.user_email,
        pass: newPass || undefined,
        from_name: config.from_name,
        active: config.active,
      });
      if (newPass) {
        setNewPass('');
        setConfig(prev => ({ ...prev, pass_set: true }));
      }
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await api.post('/alerts/email-config/test');
      toast.success(res.data.message || 'Correo de prueba enviado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar correo de prueba');
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAbsence = async (e) => {
    e.preventDefault();
    setSavingAbsence(true);
    try {
      await api.put('/reports/alert-config', absenceConfig);
      toast.success('Configuración de ausencias guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSavingAbsence(false);
    }
  };

  if (loading) return <div className="text-gray-400 py-10 text-center">Cargando...</div>;

  return (
    <div className="space-y-8 max-w-lg">
      {/* SMTP */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-1">Servidor de correo (SMTP)</h3>
        <p className="text-sm text-gray-500 mb-4">
          Configura la cuenta Gmail desde la que se enviarán las notificaciones y alertas.
        </p>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Host SMTP</label>
              <input type="text" className="input w-full" value={config.host}
                onChange={e => setConfig({ ...config, host: e.target.value })}
                placeholder="smtp.gmail.com" />
            </div>
            <div className="w-24">
              <label className="block text-sm font-medium text-gray-700 mb-1">Puerto</label>
              <input type="number" className="input w-full" value={config.port}
                onChange={e => setConfig({ ...config, port: parseInt(e.target.value) || 587 })} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correo (usuario)</label>
            <input type="email" className="input w-full" value={config.user_email}
              onChange={e => setConfig({ ...config, user_email: e.target.value })}
              placeholder="tu_correo@gmail.com" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña de aplicación
              {config.pass_set && <span className="ml-2 text-xs text-green-600 font-normal">● Contraseña guardada</span>}
            </label>
            <input type="password" className="input w-full" value={newPass}
              onChange={e => setNewPass(e.target.value)}
              placeholder={config.pass_set ? 'Dejar vacío para mantener la actual' : 'Contraseña de aplicación de Google'} />
            <p className="text-xs text-gray-400 mt-1">
              Usa una contraseña de aplicación de Google (16 caracteres sin espacios).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del remitente</label>
            <input type="text" className="input w-full" value={config.from_name}
              onChange={e => setConfig({ ...config, from_name: e.target.value })}
              placeholder="Mostrador Modelorama" />
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded text-blue-600"
                checked={!!config.active}
                onChange={e => setConfig({ ...config, active: e.target.checked ? 1 : 0 })} />
              <span className="text-sm font-medium text-gray-700">Activar envío de correos</span>
            </label>
            <p className="text-xs text-gray-400 mt-1 ml-7">
              Si está desactivado, las alertas solo se muestran en pantalla.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : 'Guardar configuración'}
            </button>
            <button type="button" onClick={handleTest} disabled={testing}
              className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              {testing ? 'Enviando...' : 'Probar conexión'}
            </button>
          </div>
        </form>
      </div>

      <hr />

      {/* Alertas de ausencia */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-1">Alertas de ausencia por email</h3>
        <p className="text-sm text-gray-500 mb-4">
          El sistema envía un email automático cuando un usuario no ficha su entrada dentro del tiempo de tolerancia.
        </p>
        <form onSubmit={handleSaveAbsence} className="space-y-4">
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded text-blue-600"
                checked={!!absenceConfig.email_active}
                onChange={e => setAbsenceConfig({ ...absenceConfig, email_active: e.target.checked ? 1 : 0 })} />
              <span className="text-sm font-medium text-gray-700">Activar alertas de ausencia por email</span>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tolerancia (minutos después del inicio del turno)
            </label>
            <div className="flex items-center gap-3">
              <input type="number" className="input w-24" min={1} max={120}
                value={absenceConfig.tolerance_minutes}
                onChange={e => setAbsenceConfig({ ...absenceConfig, tolerance_minutes: parseInt(e.target.value) || 15 })} />
              <span className="text-sm text-gray-500">minutos</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Ej: turno a las 08:00 con 15 min de tolerancia → alerta a las 08:15.
            </p>
          </div>
          <button type="submit" disabled={savingAbsence} className="btn-primary">
            {savingAbsence ? 'Guardando...' : 'Guardar configuración de ausencias'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Tab 3: Destinatarios ─────────────────────────────────────────────────────
function TabDestinatarios() {
  const [recipients, setRecipients] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/alerts/recipients');
      setRecipients(res.data);
    } catch {
      toast.error('Error al cargar destinatarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes('@')) {
      toast.error('Ingresa un email válido');
      return;
    }
    setAdding(true);
    try {
      await api.post('/alerts/recipients', { email: newEmail, name: newName || undefined });
      setNewEmail('');
      setNewName('');
      await load();
      toast.success('Destinatario agregado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al agregar destinatario');
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (recipient) => {
    try {
      await api.patch(`/alerts/recipients/${recipient.id}`);
      setRecipients(prev => prev.map(r => r.id === recipient.id ? { ...r, active: r.active ? 0 : 1 } : r));
    } catch {
      toast.error('Error al actualizar estado');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/alerts/recipients/${id}`);
      setRecipients(prev => prev.filter(r => r.id !== id));
      setConfirmDelete(null);
      toast.success('Destinatario eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (loading) return <div className="text-gray-400 py-10 text-center">Cargando...</div>;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h3 className="font-semibold text-gray-800 mb-1">Destinatarios de notificaciones</h3>
        <p className="text-sm text-gray-500">
          Correos que recibirán las alertas de tickets inusuales, cortes faltantes y otros avisos del sistema.
        </p>
      </div>

      {/* Formulario de alta */}
      <form onSubmit={handleAdd} className="flex gap-2 flex-wrap">
        <input type="email" className="input flex-1 min-w-40" placeholder="correo@ejemplo.com"
          value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
        <input type="text" className="input flex-1 min-w-32" placeholder="Nombre (opcional)"
          value={newName} onChange={e => setNewName(e.target.value)} />
        <button type="submit" disabled={adding} className="btn-primary whitespace-nowrap">
          {adding ? 'Agregando...' : '+ Agregar'}
        </button>
      </form>

      {/* Lista */}
      {recipients.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">📧</p>
          <p>No hay destinatarios configurados.</p>
          <p className="text-xs mt-1">Agrega correos para recibir notificaciones del sistema.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Correo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nombre</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recipients.map(r => (
                <tr key={r.id} className={r.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 text-gray-800 font-mono text-xs">{r.email}</td>
                  <td className="px-4 py-3 text-gray-600">{r.name || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(r)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                        r.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>
                      {r.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmDelete === r.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-500">¿Confirmar?</span>
                        <button onClick={() => handleDelete(r.id)}
                          className="text-xs px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600">Sí</button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="text-xs px-2 py-0.5 border rounded text-gray-600 hover:bg-gray-50">No</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDelete(r.id)}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors">
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AlertConfig() {
  const [activeTab, setActiveTab] = useState('alertas');

  const tabs = [
    { id: 'alertas', label: 'Alertas Recientes' },
    { id: 'correo', label: 'Configuración de Correo' },
    { id: 'destinatarios', label: 'Destinatarios' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Alertas</h2>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-emerald-500 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        {activeTab === 'alertas' && <TabAlertas />}
        {activeTab === 'correo' && <TabCorreo />}
        {activeTab === 'destinatarios' && <TabDestinatarios />}
      </div>
    </div>
  );
}
