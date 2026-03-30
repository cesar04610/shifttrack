import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import ShiftEndModal from './suppliers/ShiftEndModal';
import {
  CalendarDays, Timer, ClipboardCheck,
  ShoppingBag, Wallet, Receipt, Store, KeyRound, LogOut, PackageX,
} from 'lucide-react';

const allTabs = [
  { to: '/usuario/horario',         label: 'Horario',        Icon: CalendarDays, cajas: [1, 2, 3] },
  { to: '/usuario/fichaje',         label: 'Iniciar turno',  Icon: Timer,        cajas: [1, 2, 3] },
  { to: '/usuario/tareas',          label: 'Tareas',         Icon: ClipboardCheck, cajas: [1, 2, 3] },
  { to: '/usuario/proveedores',     label: 'Proveedores',    Icon: ShoppingBag,  cajas: [3] },
  { to: '/usuario/caja-proveedores',label: 'Caja',           Icon: Wallet,       cajas: [3] },
  { to: '/usuario/faltantes',       label: 'Faltantes',      Icon: PackageX,     cajas: [1, 2, 3] },
  { to: '/usuario/mi-corte',        label: 'Mi Corte',       Icon: Receipt,      cajas: [1, 2, 3] },
];

export default function EmployeeLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showShiftEnd, setShowShiftEnd] = useState(false);
  const [shiftEndData, setShiftEndData] = useState(null);
  const [loadingShiftEnd, setLoadingShiftEnd] = useState(false);

  const userCaja = user?.caja || 3;
  const tabs = allTabs.filter(t => t.cajas.includes(userCaja));

  const cajaLabel = userCaja ? `Caja ${userCaja}` : '';

  const handleLogoutClick = async () => {
    if (userCaja !== 3) {
      logout();
      navigate('/login');
      return;
    }

    // Caja 3: mostrar modal de cierre de turno
    setLoadingShiftEnd(true);
    try {
      const { data } = await api.get('/sessions/current-balance');
      setShiftEndData(data);
      setShowShiftEnd(true);
    } catch {
      // Si no hay sesión activa, logout directo
      logout();
      navigate('/login');
    } finally {
      setLoadingShiftEnd(false);
    }
  };

  const handleShiftEndConfirmed = async (realBalance) => {
    try {
      await api.post('/sessions/shift-end', { real_balance: realBalance });
      toast.success('Cierre de turno registrado');
      setShowShiftEnd(false);
      logout();
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar cierre de turno');
      throw err; // para que ShiftEndModal maneje el loading
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shrink-0">
            <Store size={16} strokeWidth={2} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">Mostrador <span className="text-emerald-400">Modelorama</span></p>
            <p className="text-gray-400 text-xs leading-tight">{user?.name} {cajaLabel && <span className="text-emerald-400">· {cajaLabel}</span>}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <NavLink
            to="/usuario/contrasena"
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
            title="Cambiar contraseña"
          >
            <KeyRound size={16} strokeWidth={1.8} />
          </NavLink>
          <button
            onClick={handleLogoutClick}
            disabled={loadingShiftEnd}
            className="text-gray-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            title="Cerrar sesión"
          >
            <LogOut size={16} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      {/* Tabs de navegación */}
      <nav className="bg-white border-b flex overflow-x-auto shadow-sm">
        {tabs.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 min-w-[60px] flex flex-col items-center justify-center gap-1 py-2.5 px-1 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`
            }
          >
            <Icon size={19} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="p-4 max-w-5xl mx-auto">
        <Outlet />
      </main>

      {/* Modal de cierre de turno para caja 3 */}
      {showShiftEnd && shiftEndData && (
        <ShiftEndModal
          expectedBalance={shiftEndData.expected_balance}
          onConfirmed={handleShiftEndConfirmed}
          onCancel={() => setShowShiftEnd(false)}
        />
      )}
    </div>
  );
}
