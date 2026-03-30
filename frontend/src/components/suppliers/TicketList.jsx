import { useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

function formatMXN(value) {
  return Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(dt) {
  return new Date(dt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function VoidModal({ ticket, onVoided, onCancel }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVoid = async () => {
    if (!reason.trim()) { toast.error('La razón de anulación es requerida'); return; }
    setLoading(true);
    try {
      const res = await api.post(`/tickets/${ticket.id}/void`, { void_reason: reason });
      toast.success('Ticket anulado');
      onVoided(res.data.current_balance);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al anular ticket');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Anular ticket</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {ticket.supplier_name} — ${formatMXN(ticket.amount)}
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">Razón de anulación</label>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            placeholder="Describe el motivo..."
            autoFocus
          />
        </div>
        <div className="px-5 pb-4 flex gap-3">
          <button onClick={onCancel} className="flex-1 border rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleVoid}
            disabled={loading}
            className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Anulando...' : 'Anular'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TicketList({ tickets, shiftChanges, balanceAdditions = [], shiftEnds = [], onUpdate, currentUserId }) {
  const [voidingTicket, setVoidingTicket] = useState(null);

  // Combinar tickets, separadores de turno, adiciones y cierres de turno
  const combined = [
    ...tickets.map(t => ({ type: 'ticket', ts: new Date(t.registered_at).getTime(), data: t })),
    ...shiftChanges.map(s => ({ type: 'shift', ts: new Date(s.changed_at).getTime(), data: s })),
    ...balanceAdditions.map(a => ({ type: 'addition', ts: new Date(a.added_at).getTime(), data: a })),
    ...shiftEnds.map(se => ({ type: 'shift-end', ts: new Date(se.ended_at).getTime(), data: se })),
  ].sort((a, b) => a.ts - b.ts);

  const canVoid = (ticket) => {
    if (ticket.is_voided) return false;
    if (ticket.employee_id !== currentUserId) return false;
    return Date.now() - new Date(ticket.registered_at).getTime() <= 5 * 60 * 1000;
  };

  if (combined.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        Sin pagos registrados aún hoy
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {combined.map((item, idx) => {
          if (item.type === 'shift') {
            const s = item.data;
            return (
              <div key={`shift-${s.id}`} className="flex items-center gap-3 my-3">
                <div className="flex-1 border-t border-dashed border-blue-300" />
                <span className="text-xs text-blue-500 font-medium whitespace-nowrap">
                  🔄 Turno: {s.outgoing_name} → {s.incoming_name} | {formatTime(s.changed_at)}
                  {s.cash_at_change !== null && (
                    <span className={`ml-1 ${s.difference_at_change < 0 ? 'text-red-500' : 'text-green-600'}`}>
                      (${formatMXN(s.cash_at_change)} declarado)
                    </span>
                  )}
                </span>
                <div className="flex-1 border-t border-dashed border-blue-300" />
              </div>
            );
          }

          if (item.type === 'addition') {
            const a = item.data;
            return (
              <div key={`addition-${a.id}`} className="flex items-center gap-3 my-3">
                <div className="flex-1 border-t border-dashed border-green-300" />
                <span className="text-xs text-green-600 font-medium whitespace-nowrap">
                  💵 +${formatMXN(a.amount)} agregado por {a.added_by_name} | {formatTime(a.added_at)}
                </span>
                <div className="flex-1 border-t border-dashed border-green-300" />
              </div>
            );
          }

          if (item.type === 'shift-end') {
            const se = item.data;
            return (
              <div key={`shift-end-${se.id}`} className="flex items-center gap-3 my-3">
                <div className="flex-1 border-t border-dashed border-orange-300" />
                <span className="text-xs text-orange-600 font-medium whitespace-nowrap">
                  🚪 Cierre: {se.user_name} | ${formatMXN(se.declared_balance)} declarado
                  <span className={`ml-1 ${se.difference < 0 ? 'text-red-500' : se.difference > 0 ? 'text-blue-500' : 'text-green-600'}`}>
                    ({se.difference >= 0 ? '+' : ''}${formatMXN(se.difference)})
                  </span>
                  {' | '}{formatTime(se.ended_at)}
                </span>
                <div className="flex-1 border-t border-dashed border-orange-300" />
              </div>
            );
          }

          const t = item.data;
          return (
            <div
              key={t.id}
              className={`flex items-start justify-between p-3 rounded-lg border ${
                t.is_voided ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800 truncate">{t.supplier_name}</span>
                  {t.is_voided && (
                    <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Anulado</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {formatTime(t.registered_at)} · {t.employee_name}
                  {t.note && <span className="ml-1 italic">· {t.note}</span>}
                </div>
                {t.is_voided && t.void_reason && (
                  <div className="text-xs text-red-500 mt-0.5">Anulado: {t.void_reason}</div>
                )}
              </div>

              <div className="flex items-center gap-2 ml-3 shrink-0">
                <span className={`text-sm font-semibold ${t.is_voided ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  ${formatMXN(t.amount)}
                </span>
                {canVoid(t) && (
                  <button
                    onClick={() => setVoidingTicket(t)}
                    className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-1.5 py-0.5"
                  >
                    Anular
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {voidingTicket && (
        <VoidModal
          ticket={voidingTicket}
          onVoided={(balance) => { setVoidingTicket(null); onUpdate(balance); }}
          onCancel={() => setVoidingTicket(null)}
        />
      )}
    </>
  );
}
