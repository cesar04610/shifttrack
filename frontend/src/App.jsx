import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AdminLayout from './components/AdminLayout';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Schedules from './pages/Schedules';
import Reports from './pages/Reports';
import AlertConfig from './pages/AlertConfig';
import Tasks from './pages/Tasks';
import ProveedoresAnalytics from './pages/admin/ProveedoresAnalytics';
import Cortes from './pages/admin/Cortes';
import EmployeeLayout from './components/EmployeeLayout';
import MySchedule from './pages/MySchedule';
import ClockPage from './pages/ClockPage';
import MyTasks from './pages/MyTasks';
import Proveedores from './pages/employee/Proveedores';
import MiCorte from './pages/employee/MiCorte';
import CajaProveedores from './pages/employee/CajaProveedores';
import Faltantes from './pages/employee/Faltantes';
import ChangePassword from './pages/ChangePassword';

function PrivateRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-gray-500">Cargando...</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/usuario/horario'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RoleRedirect />} />

        {/* Admin */}
        <Route path="/admin" element={<PrivateRoute role="admin"><AdminLayout /></PrivateRoute>}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="usuarios" element={<Employees />} />
          <Route path="horarios" element={<Schedules />} />
          <Route path="tareas" element={<Tasks />} />
          <Route path="reportes" element={<Reports />} />
          <Route path="alertas" element={<AlertConfig />} />
          <Route path="proveedores" element={<ProveedoresAnalytics />} />
          <Route path="cortes" element={<Cortes />} />
          <Route path="contrasena" element={<ChangePassword />} />
        </Route>

        {/* Usuario */}
        <Route path="/usuario" element={<PrivateRoute role="employee"><EmployeeLayout /></PrivateRoute>}>
          <Route path="horario" element={<MySchedule />} />
          <Route path="fichaje" element={<ClockPage />} />
          <Route path="tareas" element={<MyTasks />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="caja-proveedores" element={<CajaProveedores />} />
          <Route path="faltantes" element={<Faltantes />} />
          <Route path="mi-corte" element={<MiCorte />} />
          <Route path="contrasena" element={<ChangePassword />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
