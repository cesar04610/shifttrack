import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function ClockPage() {
  const { user } = useAuth();
  const [activeRecord, setActiveRecord] = useState(null);
  const [todayRecords, setTodayRecords] = useState([]);
  const [todayShifts, setTodayShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clocking, setClocking] = useState(false);
  const [now, setNow] = useState(new Date());

  // Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    setLoading(true);
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    try {
      const [statusRes, todayRes, schedRes] = await Promise.all([
        api.get('/clock/status'),
        api.get('/clock/today'),
        api.get(`/schedules?week=${getMondayOfCurrentWeek()}`),
      ]);
      setActiveRecord(statusRes.data.active_clock_in);
      setTodayRecords(todayRes.data);
      setTodayShifts(schedRes.data.filter(s => s.date === today));
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleClockIn = async () => {
    setClocking(true);
    try {
      let lat = null, lng = null;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch { /* GPS opcional */ }
      }
      const scheduleId = todayShifts[0]?.id || null;
      await api.post('/clock/in', { lat, lng, schedule_id: scheduleId });
      toast.success('Entrada registrada');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar entrada');
    } finally {
      setClocking(false);
    }
  };

  const handleClockOut = async () => {
    setClocking(true);
    try {
      let lat = null, lng = null;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch { /* GPS opcional */ }
      }
      const res = await api.post('/clock/out', { lat, lng });
      toast.success(`Salida registrada. ${res.data.hours_worked} horas trabajadas`);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar salida');
    } finally {
      setClocking(false);
    }
  };

  if (loading) return <div className="text-gray-400 py-10 text-center">Cargando...</div>;

  const todayStr = format(now, "EEEE d 'de' MMMM", { locale: es });
  const timeStr = format(now, 'HH:mm:ss');

  return (
    <div className="py-4 space-y-5">
      {/* Reloj */}
      <div className="bg-blue-700 text-white rounded-2xl p-6 text-center shadow-lg">
        <p className="text-blue-200 text-sm capitalize mb-1">{todayStr}</p>
        <p className="text-4xl font-mono font-bold tracking-widest">{timeStr}</p>
        <p className="text-blue-200 text-sm mt-2">{user?.name}</p>
      </div>

      {/* Turno de hoy */}
      {todayShifts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Tu turno de hoy</p>
          {todayShifts.map(s => (
            <p key={s.id} className="text-lg font-bold text-gray-900">
              {s.start_time} – {s.end_time}
            </p>
          ))}
        </div>
      )}

      {/* Estado actual */}
      <div className={`rounded-xl p-4 border-2 text-center ${activeRecord ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
        {activeRecord ? (
          <>
            <div className="text-green-600 text-2xl mb-1">🟢</div>
            <p className="font-semibold text-green-700">Entrada registrada</p>
            <p className="text-sm text-green-600">
              {format(new Date(activeRecord.clock_in), 'HH:mm')} hrs
            </p>
          </>
        ) : (
          <>
            <div className="text-gray-400 text-2xl mb-1">🔴</div>
            <p className="font-semibold text-gray-600">Sin entrada registrada</p>
          </>
        )}
      </div>

      {/* Botones fichar */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleClockIn}
          disabled={clocking || !!activeRecord}
          className="btn py-4 text-base bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 disabled:opacity-40 rounded-xl"
        >
          ⬆️ Entrada
        </button>
        <button
          onClick={handleClockOut}
          disabled={clocking || !activeRecord}
          className="btn py-4 text-base bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:opacity-40 rounded-xl"
        >
          ⬇️ Salida
        </button>
      </div>

      {/* Historial del día */}
      {todayRecords.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Registros de hoy</p>
          <div className="space-y-2">
            {todayRecords.map(r => (
              <div key={r.id} className="flex justify-between text-sm">
                <span className="text-gray-600">
                  🟢 {format(new Date(r.clock_in), 'HH:mm')}
                  {r.clock_out && <> → 🔴 {format(new Date(r.clock_out), 'HH:mm')}</>}
                </span>
                {r.hours_worked && (
                  <span className="font-medium text-blue-700">{r.hours_worked} h</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getMondayOfCurrentWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
