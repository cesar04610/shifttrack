import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Users, CalendarDays, ClipboardCheck,
  BarChart3, Bell, ShoppingBag, Receipt, Wallet,
  KeyRound, LogOut, Store,
} from 'lucide-react';

const navItems = [
  { to: '/admin/dashboard',   label: 'Inicio',      Icon: LayoutDashboard },
  { to: '/admin/usuarios',    label: 'Usuarios',    Icon: Users },
  { to: '/admin/horarios',    label: 'Horarios',    Icon: CalendarDays },
  { to: '/admin/tareas',      label: 'Tareas',      Icon: ClipboardCheck },
  { to: '/admin/reportes',    label: 'Reportes',    Icon: BarChart3 },
  { to: '/admin/alertas',     label: 'Alertas',     Icon: Bell },
  { to: '/admin/proveedores', label: 'Proveedores', Icon: ShoppingBag },
  { to: '/admin/cortes',      label: 'Cortes',      Icon: Receipt },
  { to: '/admin/caja-general', label: 'Caja General', Icon: Wallet },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col fixed h-full">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0">
              <Store size={20} strokeWidth={2} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-tight truncate">Mostrador</p>
              <p className="text-xs font-semibold text-emerald-400 leading-tight truncate">Modelorama</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2 pl-0.5">Panel Administrador</p>
        </div>

        {/* Navegación */}
        <nav className="flex-1 py-4 space-y-0.5 px-3 overflow-y-auto">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={17} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-5 space-y-0.5 border-t border-gray-700 pt-3">
          <NavLink
            to="/admin/contrasena"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors w-full"
          >
            <KeyRound size={17} strokeWidth={1.8} /> Cambiar contraseña
          </NavLink>
          <div className="px-3 py-1.5 text-xs text-gray-500 truncate">{user?.name}</div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-900/60 hover:text-red-300 transition-colors w-full text-left"
          >
            <LogOut size={17} strokeWidth={1.8} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="ml-56 flex-1 p-6 min-h-screen bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
