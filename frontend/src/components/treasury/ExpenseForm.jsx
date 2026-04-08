import { useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function ExpenseForm({ categories = [], onSuccess }) {
  const [form, setForm] = useState({ amount: '', description: '', category_id: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Ingresa un monto válido');
    if (!form.category_id) return toast.error('Selecciona una categoría');

    setLoading(true);
    try {
      await api.post('/treasury/expense', {
        amount: Number(form.amount),
        description: form.description,
        category_id: form.category_id,
      });
      toast.success('Gasto registrado');
      setForm({ amount: '', description: '', category_id: '' });
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar gasto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Registrar Gasto</h3>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          placeholder="$0.00"
          value={form.amount}
          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
        <select
          value={form.category_id}
          onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Seleccionar...</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
        <input
          type="text"
          placeholder="Descripción del gasto..."
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {loading ? 'Registrando...' : 'Registrar gasto'}
      </button>
    </form>
  );
}
