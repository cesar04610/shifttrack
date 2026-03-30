import { useEffect, useState } from 'react';
import api from '../services/api';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Dashboard() {
  const [stats, setStats] = useState({ employees: 0, schedules_today: 0, present_today: 0, absent_today: 0 });
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayLabel = format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es });

  useEffect(() => {
    Promise.all([
      api.get('/employees'),
      api.get(`/reports/absences?date=${today}`),
    ]).then(([empRes, absRes]) => {
      const employees = empRes.data;
      const absenceData = absRes.data;
      const present = absenceData.filter(a => a.status === 'fichado').length;
      const absent = absenceData.filter(a => a.status === 'ausente').length;
      setStats({
        employees: employees.length,
        schedules_today: absenceData.length,
        present_today: present,
        absent_today: absent,
      });
      setAbsences(absenceData);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400 py-10 text-center">Cargando...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Resumen de hoy</h2>
        <p className="text-gray-500 text-sm capitalize">{todayLabel}</p>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Usuarios activos" value={stats.employees} color="blue" icon="👥" />
        <StatCard label="Turnos hoy" value={stats.schedules_today} color="purple" icon="📅" />
        <StatCard label="Presentes" value={stats.present_today} color="green" icon="✅" />
        <StatCard label="Ausentes/Sin fichar" value={stats.absent_today} color="red" icon="⚠️" />
      </div>

      {/* Estado de turnos de hoy */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">Turnos de hoy</h3>
        {absences.length === 0 ? (
          <p className="text-gray-400 text-sm">No hay turnos programados para hoy.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Usuario</th>
                  <th className="pb-2 font-medium">Turno</th>
                  <th className="pb-2 font-medium">Estado</th>
                  <th className="pb-2 font-medium">Entrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {absences.map(a => (
                  <tr key={a.schedule_id}>
                    <td className="py-2.5 font-medium">{a.employee_name}</td>
                    <td className="py-2.5 text-gray-600">{a.start_time} – {a.end_time}</td>
                    <td className="py-2.5">
                      {a.status === 'fichado'
                        ? <span className="badge-green">Fichado</span>
                        : <span className="badge-red">Sin fichar</span>
                      }
                    </td>
                    <td className="py-2.5 text-gray-500">
                      {a.clock_in ? format(new Date(a.clock_in), 'HH:mm') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
  };
  return (
    <div className="card p-4">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${colors[color]} text-xl mb-3`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}
