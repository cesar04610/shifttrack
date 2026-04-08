import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

function formatMXN(value) {
  return Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getWeekRange(refDate) {
  const d = new Date(refDate + 'T00:00:00');
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (dt) => dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0');

  return { from: fmt(monday), to: fmt(sunday) };
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return `${days[d.getDay()]} ${d.getDate()}`;
}

export default function TreasuryHistory() {
  const [refDate, setRefDate] = useState(() => {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedDate, setExpandedDate] = useState(null);
  const [dayMovements, setDayMovements] = useState([]);

  const { from, to } = getWeekRange(refDate);

  useEffect(() => {
    setLoading(true);
    api.get('/treasury/history', { params: { from, to } })
      .then(r => setHistory(r.data.days || []))
      .catch(() => toast.error('Error al cargar historial'))
      .finally(() => setLoading(false));
  }, [from, to]);

  const navigateWeek = (dir) => {
    const d = new Date(refDate + 'T00:00:00');
    d.setDate(d.getDate() + dir * 7);
    setRefDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    setExpandedDate(null);
  };

  const toggleDay = async (dateStr) => {
    if (expandedDate === dateStr) {
      setExpandedDate(null);
      return;
    }
    try {
      const r = await api.get('/treasury/movements', { params: { from: dateStr, to: dateStr } });
      setDayMovements(r.data || []);
      setExpandedDate(dateStr);
    } catch {
      toast.error('Error al cargar movimientos');
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/treasury/export', { params: { from, to }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `caja_general_${from}_${to}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Error al exportar');
    }
  };

  const typeLabels = {
    initial_cash: 'Efectivo inicial',
    expense: 'Gasto',
    bank_withdrawal: 'Retiro de banco',
    adjustment: 'Ajuste',
  };

  const formatRange = () => {
    const f = new Date(from + 'T00:00:00');
    const t = new Date(to + 'T00:00:00');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${f.getDate()} - ${t.getDate()} ${months[t.getMonth()]} ${t.getFullYear()}`;
  };

  return (
    <div className="space-y-4">
      {/* Header con navegación */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigateWeek(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
            {formatRange()}
          </span>
          <button onClick={() => navigateWeek(1)} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <ChevronRight size={18} />
          </button>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Download size={14} /> Exportar .xlsx
        </button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Efectivo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Banco</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Mov.</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {history.map(day => (
                <>
                  <tr key={day.date} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-700">{formatDateShort(day.date)}</td>
                    <td className="px-4 py-3 text-right text-green-700">${formatMXN(day.cash)}</td>
                    <td className="px-4 py-3 text-right text-blue-700">${formatMXN(day.bank)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">${formatMXN(day.total)}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{day.movementCount + day.cutCount}</td>
                    <td className="px-4 py-3 text-center">
                      {(day.movementCount + day.cutCount) > 0 && (
                        <button
                          onClick={() => toggleDay(day.date)}
                          className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1 mx-auto"
                        >
                          <Eye size={13} /> {expandedDate === day.date ? 'Ocultar' : 'Ver'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedDate === day.date && (
                    <tr key={`${day.date}-detail`}>
                      <td colSpan={6} className="px-6 py-3 bg-gray-50">
                        {dayMovements.length === 0 ? (
                          <p className="text-xs text-gray-400">Sin movimientos manuales</p>
                        ) : (
                          <div className="space-y-1">
                            {dayMovements.map(m => (
                              <div key={m.id} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-400">{m.created_at?.split(' ')[1]?.slice(0, 5)}</span>
                                  <span className="font-medium">{typeLabels[m.movement_type]}</span>
                                  <span className="text-gray-500">{m.description}{m.category_name ? ` (${m.category_name})` : ''}</span>
                                </div>
                                <span className={`font-medium ${m.movement_type === 'expense' ? 'text-red-600' : 'text-green-700'}`}>
                                  {m.movement_type === 'expense' ? '-' : m.amount >= 0 ? '+' : ''}${formatMXN(Math.abs(m.amount))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
