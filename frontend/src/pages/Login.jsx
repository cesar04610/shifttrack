import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Store, ShieldCheck } from 'lucide-react';

export default function Login() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [caja, setCaja] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cajaError, setCajaError] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCajaError(null);
    if (!isAdmin && !caja) {
      setCajaError('Selecciona una caja para continuar');
      return;
    }
    setLoading(true);
    try {
      const cajaNum = isAdmin ? null : parseInt(caja);
      const user = await login(name, password, cajaNum);
      navigate(user.role === 'admin' ? '/admin/dashboard' : '/usuario/horario');
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al iniciar sesión';
      // Si es error 409 (caja ocupada), mostrar mensaje especial
      if (err.response?.status === 409) {
        setCajaError(msg);
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header con marca */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl mb-4 backdrop-blur-sm">
            <Store className="text-white" size={34} strokeWidth={1.8} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Mostrador</h1>
          <p className="text-emerald-100 font-semibold text-lg leading-tight">Modelorama</p>
          <p className="text-emerald-200 text-xs mt-1">Sistema de gestión de tienda</p>
        </div>

        {/* Formulario */}
        <div className="px-8 py-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
              <input
                type="text"
                className="input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nombre de usuario"
                required
                autoFocus
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {/* Selector de caja (solo para usuarios normales) */}
            {!isAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número de caja</label>
                <div className="grid grid-cols-3 gap-2">
                  {['1', '2', '3'].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => { setCaja(n); setCajaError(null); }}
                      className={`py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                        caja === n
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      Caja {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Error de caja */}
            {cajaError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
                <span className="text-lg leading-none">{cajaError.includes('Selecciona') ? '⚠️' : '🔒'}</span>
                <span>{cajaError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors mt-2 flex items-center justify-center gap-2"
            >
              {loading ? 'Ingresando...' : (isAdmin ? 'Ingresar como Administrador' : 'Ingresar')}
            </button>
          </form>

          {/* Toggle admin */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsAdmin(!isAdmin)}
              className="text-xs text-gray-400 hover:text-emerald-600 transition-colors"
            >
              {isAdmin ? '← Volver al inicio de sesión normal' : 'Ingresar como Administrador'}
            </button>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-5 text-xs text-gray-400">
            <ShieldCheck size={13} />
            <span>Red local · Acceso seguro</span>
          </div>
        </div>
      </div>
    </div>
  );
}
