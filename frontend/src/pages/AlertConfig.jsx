import { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function AlertConfig() {
  const [config, setConfig] = useState({ tolerance_minutes: 15, email_active: 1 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/reports/alert-config').then(r => setConfig(r.data)).finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/reports/alert-config', config);
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-gray-400 py-10 text-center">Cargando...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Configuración de Alertas</h2>

      <div className="card max-w-lg">
        <div className="mb-6">
          <h3 className="font-semibold text-gray-800 mb-1">Alertas de ausencia por email</h3>
          <p className="text-sm text-gray-500">
            El sistema envía un email automático cuando un usuario no ficha su entrada dentro del tiempo de tolerancia configurado.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded text-blue-600"
                checked={!!config.email_active}
                onChange={e => setConfig({...config, email_active: e.target.checked ? 1 : 0})}
              />
              <span className="text-sm font-medium text-gray-700">Activar alertas por email</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tolerancia (minutos después del inicio del turno)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                className="input w-24"
                min={1}
                max={120}
                value={config.tolerance_minutes}
                onChange={e => setConfig({...config, tolerance_minutes: parseInt(e.target.value) || 15})}
              />
              <span className="text-sm text-gray-500">minutos</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Si el usuario tiene turno a las 08:00 y la tolerancia es 15 min, la alerta se enviará a las 08:15.
            </p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
            <strong>Nota:</strong> Para recibir emails configura las credenciales SMTP en el archivo <code className="bg-yellow-100 px-1 rounded">.env</code> del backend (ver README).
          </div>

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </form>
      </div>
    </div>
  );
}
