import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

function formatMXN(value) {
  return Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const typeConfig = {
  initial_cash:    { label: 'Efectivo inicial',  badge: 'bg-gray-100 text-gray-800',   sign: '+' },
  expense:         { label: 'Gasto',             badge: 'bg-red-100 text-red-800',      sign: '-' },
  bank_withdrawal: { label: 'Retiro de banco',   badge: 'bg-blue-100 text-blue-800',    sign: '+' },
  adjustment:      { label: 'Ajuste',            badge: 'bg-yellow-100 text-yellow-800', sign: '' },
};

export default function MovementsList({ movements = [], cuts = [], supplierPayments = [], isToday, onDelete }) {
  const handleDelete = async (id, type) => {
    if (!confirm('¿Eliminar este movimiento?')) return;
    try {
      const endpoint = type === 'expense' ? `/treasury/expense/${id}` : `/treasury/bank-withdrawal/${id}`;
      await api.delete(endpoint);
      toast.success('Movimiento eliminado');
      onDelete?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    }
  };

  const allEmpty = movements.length === 0 && cuts.length === 0 && supplierPayments.length === 0;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
        Movimientos del día
      </h3>
      {allEmpty ? (
        <p className="text-sm text-gray-400 text-center py-6">Sin movimientos registrados</p>
      ) : (
        <div className="divide-y">
          {/* Cortes de caja */}
          {cuts.map(cut => (
            <div key={`cut-${cut.id}`} className="flex items-center justify-between py-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{cut.submitted_at?.split(' ')[1]?.slice(0, 5) || '--:--'}</span>
                <div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mr-2">
                    Corte
                  </span>
                  <span className="text-gray-700">{cut.register_name} — {cut.employee_name} ({cut.shift_label})</span>
                </div>
              </div>
              <div className="text-right text-xs space-y-0.5">
                <div className="text-green-700">Efectivo +${formatMXN(cut.expected_cash)}</div>
                <div className="text-blue-700">Tarjeta +${formatMXN(cut.card_payments)}</div>
              </div>
            </div>
          ))}

          {/* Pagos a proveedores (Caja 3) */}
          {supplierPayments.map(sp => (
            <div key={`sp-${sp.id}`} className="flex items-center justify-between py-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{sp.registered_at?.split(' ')[1]?.slice(0, 5) || '--:--'}</span>
                <div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 mr-2">
                    Proveedor
                  </span>
                  <span className="text-gray-700">{sp.supplier_name}</span>
                  {sp.note && <span className="text-gray-400 text-xs ml-2">— {sp.note}</span>}
                  <span className="text-gray-400 text-xs ml-2">({sp.employee_name})</span>
                </div>
              </div>
              <span className="font-medium text-red-600">-${formatMXN(sp.amount)}</span>
            </div>
          ))}

          {/* Movimientos manuales */}
          {movements.map(m => {
            const config = typeConfig[m.movement_type] || { label: m.movement_type, badge: 'bg-gray-100 text-gray-700', sign: '' };
            const canDelete = isToday && (m.movement_type === 'expense' || m.movement_type === 'bank_withdrawal');
            const sign = m.movement_type === 'expense' ? '-' : (m.amount >= 0 ? '+' : '');

            return (
              <div key={m.id} className="flex items-center justify-between py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{m.created_at?.split(' ')[1]?.slice(0, 5) || '--:--'}</span>
                  <div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.badge} mr-2`}>
                      {config.label}
                    </span>
                    <span className="text-gray-700">
                      {m.description || ''}
                      {m.category_name ? ` (${m.category_name})` : ''}
                    </span>
                    {m.movement_type === 'adjustment' && m.expected_before != null && (
                      <span className="text-xs text-gray-400 ml-2">
                        Esperado: ${formatMXN(m.expected_before)} → Declarado: ${formatMXN(m.declared_amount)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${m.movement_type === 'expense' ? 'text-red-600' : m.amount < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {sign}${formatMXN(Math.abs(m.amount))}
                  </span>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(m.id, m.movement_type)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
