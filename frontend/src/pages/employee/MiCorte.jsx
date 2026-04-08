import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import CutForm from '../../components/cuts/CutForm';

function formatMXN(v) {
  return Number(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
}

function DiffBadge({ diff }) {
  const abs = Math.abs(diff);
  if (abs === 0) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">$0.00</span>;
  if (abs <= 100) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">{diff > 0 ? '+' : '-'}${formatMXN(abs)}</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{diff > 0 ? '+' : '-'}${formatMXN(abs)}</span>;
}

export default function MiCorte() {
  const [shiftData, setShiftData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    try {
      const [shiftRes, histRes] = await Promise.all([
        api.get('/cuts/active-shift'),
        api.get('/cuts/my-cuts'),
      ]);
      setShiftData(shiftRes.data);
      setHistory(histRes.data);
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSaved = () => {
    setShowForm(false);
    load();
  };

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>;

  const hasSchedule = shiftData?.schedule?.start_time;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">Mi Corte de Caja</h1>

      {/* Estado del turno actual */}
      {!shiftData?.has_active_shift ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center">
          <div className="text-3xl mb-2">🕐</div>
          <p className="text-gray-600 font-medium">Sin fichaje de entrada hoy</p>
          <p className="text-sm text-gray-400 mt-1">Para registrar un corte debes fichar tu entrada primero</p>
        </div>
      ) : shiftData.existing_cut ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-green-800">Corte de {shiftData.current_shift?.toLowerCase()} registrado</p>
              <p className="text-sm text-green-600">
                {hasSchedule && <>Turno {shiftData.schedule.start_time}–{shiftData.schedule.end_time} · </>}
                Registrado a las {new Date(shiftData.existing_cut.submitted_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800">{hasSchedule ? 'Turno activo' : 'Entrada registrada'}</p>
              <p className="text-sm text-gray-500">
                {hasSchedule
                  ? `${shiftData.schedule.start_time}–${shiftData.schedule.end_time}`
                  : 'Sin turno programado'
                }
              </p>
            </div>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
              Turno {shiftData.current_shift} · Pendiente de corte
            </span>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            Registrar corte de {shiftData.current_shift?.toLowerCase()}
          </button>
        </div>
      )}

      {/* Historial */}
      {history.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">Historial de cortes</h2>
          <div className="space-y-2">
            {history.map(cut => (
              <div key={cut.id} className="bg-white border rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-800">
                      {cut.shift_date
                        ? new Date(cut.shift_date + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'short', day:'2-digit', month:'short' })
                        : 'Sin fecha'
                      }
                    </p>
                    <p className="text-xs text-gray-500">
                      {cut.register_name}
                      {cut.shift_label && <> · {cut.shift_label}</>}
                      {cut.start_time && <> · {cut.start_time}–{cut.end_time}</>}
                    </p>
                  </div>
                  <DiffBadge diff={cut.cash_difference} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-400">Ventas</p>
                    <p className="font-semibold">${formatMXN(cut.total_sales)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-400">Ef. esperado</p>
                    <p className="font-semibold">${formatMXN(cut.expected_cash)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-400">Ef. declarado</p>
                    <p className="font-semibold">${formatMXN(cut.declared_cash)}</p>
                  </div>
                </div>
                {cut.is_anomaly ? (
                  <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                    ⚠️ Anomalia detectada · desviación {cut.deviation_pct}%
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <CutForm
          schedule={shiftData.schedule}
          onSaved={handleSaved}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
