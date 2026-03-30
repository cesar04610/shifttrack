import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import TicketForm from '../../components/suppliers/TicketForm';
import TicketList from '../../components/suppliers/TicketList';
import AddBalanceModal from '../../components/suppliers/AddBalanceModal';
import { useAuth } from '../../context/AuthContext';

function formatMXN(value) {
  return Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getLocalDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function CajaProveedores() {
  const { user } = useAuth();
  const [state, setState] = useState(null); // { session, tickets, shiftChanges, balanceAdditions, shiftEnds }
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modales
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [showAddBalance, setShowAddBalance] = useState(false);

  const sessionDateRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      // Auto-crear sesión si no existe
      await api.post('/sessions/auto');

      const [sessionRes, suppliersRes] = await Promise.all([
        api.get('/tickets'),
        api.get('/suppliers'),
      ]);
      setState(sessionRes.data);
      setSuppliers(suppliersRes.data);
      sessionDateRef.current = sessionRes.data?.session?.session_date || null;
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Detección de medianoche: recargar datos cuando cambie el día
  useEffect(() => {
    const interval = setInterval(() => {
      const today = getLocalDate();
      if (sessionDateRef.current && sessionDateRef.current !== today) {
        loadData();
      }
    }, 30000); // cada 30 segundos
    return () => clearInterval(interval);
  }, [loadData]);

  const handleTicketSaved = () => {
    setShowTicketForm(false);
    loadData();
  };

  const handleAddBalanceSaved = () => {
    setShowAddBalance(false);
    loadData();
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>;
  }

  const session = state?.session;
  if (!session) {
    return <div className="text-center py-12 text-gray-400 text-sm">Error al iniciar sesión de caja</div>;
  }

  const totalSpent = session.total_spent || 0;
  const totalAdditions = session.total_additions || 0;
  const currentBalance = session.current_balance ?? (session.initial_balance + totalAdditions - totalSpent);

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-4">Caja Proveedores</h1>

      <div className="lg:grid lg:grid-cols-3 lg:gap-6 space-y-4 lg:space-y-0">
        {/* Columna izquierda: saldos + acciones */}
        <div className="lg:col-span-1 space-y-4">
          {/* Tarjetas de saldo */}
          <div className="space-y-3">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Saldo inicial</p>
              <p className="text-2xl font-bold text-gray-700 mt-1">${formatMXN(session.initial_balance)}</p>
              <button
                onClick={() => setShowAddBalance(true)}
                className="mt-2 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg px-3 py-1.5 font-medium hover:bg-green-100 transition-colors"
              >
                + Agregar saldo
              </button>
            </div>
            <div className={`rounded-xl border p-4 ${currentBalance < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Saldo actual</p>
              <p className={`text-2xl font-bold mt-1 ${currentBalance < 0 ? 'text-red-600' : 'text-green-700'}`}>
                ${formatMXN(currentBalance)}
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-700">
            Total pagado hoy: <strong>${formatMXN(totalSpent)}</strong>
            {' · '}
            {(state.tickets || []).filter(t => !t.is_voided).length} pagos
            {totalAdditions > 0 && (
              <span className="ml-2 text-green-700">
                · Agregado: <strong>${formatMXN(totalAdditions)}</strong>
              </span>
            )}
          </div>

          {/* Botón de acción */}
          <button
            onClick={() => setShowTicketForm(true)}
            className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            <span className="text-lg">+</span>
            <span>Registrar pago</span>
          </button>
        </div>

        {/* Columna derecha: lista de pagos */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">
            Pagos del día
          </h2>
          <div className="lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
            <TicketList
              tickets={state.tickets || []}
              shiftChanges={state.shiftChanges || []}
              balanceAdditions={state.balanceAdditions || []}
              shiftEnds={state.shiftEnds || []}
              onUpdate={(balance) => {
                setState(prev => ({
                  ...prev,
                  session: { ...prev.session, current_balance: balance },
                }));
                loadData();
              }}
              currentUserId={user?.id}
            />
          </div>
        </div>
      </div>

      {/* Modales */}
      {showTicketForm && (
        <TicketForm
          suppliers={suppliers}
          onSaved={handleTicketSaved}
          onCancel={() => setShowTicketForm(false)}
        />
      )}
      {showAddBalance && (
        <AddBalanceModal
          onSaved={handleAddBalanceSaved}
          onCancel={() => setShowAddBalance(false)}
        />
      )}
    </div>
  );
}
