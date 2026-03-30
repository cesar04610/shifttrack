import { useEffect, useState } from 'react';
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function MySchedule() {
  const { user } = useAuth();
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [schedules, setSchedules] = useState([]);

  const monday = format(currentWeek, 'yyyy-MM-dd');
  const weekLabel = `${format(currentWeek, "d MMM", { locale: es })} – ${format(addDays(currentWeek, 6), "d MMM yyyy", { locale: es })}`;

  useEffect(() => {
    api.get(`/schedules?week=${monday}`).then(r => setSchedules(r.data));
  }, [monday]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i));
  const today = format(new Date(), 'yyyy-MM-dd');

  const getShiftForDay = (date) => {
    const d = format(date, 'yyyy-MM-dd');
    return schedules.filter(s => s.date === d);
  };

  return (
    <div className="py-4">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Mi Horario</h2>
      <p className="text-gray-500 text-sm mb-5">Hola, {user?.name}</p>

      {/* Navegación de semana */}
      <div className="flex items-center justify-between mb-4 bg-white rounded-xl border px-4 py-2">
        <button onClick={() => setCurrentWeek(w => subWeeks(w, 1))} className="text-blue-600 font-bold text-lg px-2">←</button>
        <span className="text-sm font-medium text-gray-700">{weekLabel}</span>
        <button onClick={() => setCurrentWeek(w => addWeeks(w, 1))} className="text-blue-600 font-bold text-lg px-2">→</button>
      </div>

      {/* Días de la semana */}
      <div className="space-y-2">
        {weekDays.map((day, idx) => {
          const isToday = format(day, 'yyyy-MM-dd') === today;
          const shifts = getShiftForDay(day);
          return (
            <div key={idx} className={`bg-white rounded-xl border p-4 ${isToday ? 'border-blue-500 shadow-sm' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                    {format(day, 'd')}
                  </div>
                  <div>
                    <div className={`font-semibold text-sm ${isToday ? 'text-blue-700' : 'text-gray-800'}`}>
                      {DAYS[idx]} {isToday && <span className="text-xs font-normal text-blue-500 ml-1">Hoy</span>}
                    </div>
                    <div className="text-xs text-gray-400">{format(day, "d 'de' MMMM", { locale: es })}</div>
                  </div>
                </div>
                <div className="text-right">
                  {shifts.length === 0 ? (
                    <span className="text-xs text-gray-400">Sin turno</span>
                  ) : (
                    shifts.map(s => (
                      <div key={s.id} className="text-sm font-semibold text-blue-700">
                        {s.start_time} – {s.end_time}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
