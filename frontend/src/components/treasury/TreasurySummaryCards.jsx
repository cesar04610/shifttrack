import { Banknote, Landmark, Wallet } from 'lucide-react';

function formatMXN(value) {
  return Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const cards = [
  { key: 'cash', label: 'Efectivo en Caja', Icon: Banknote, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  { key: 'bank', label: 'Saldo en Banco',   Icon: Landmark, color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200' },
  { key: 'total', label: 'Total del Negocio', Icon: Wallet, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
];

export default function TreasurySummaryCards({ cash = 0, bank = 0, total = 0, loading }) {
  const values = { cash, bank, total };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map(c => (
          <div key={c.key} className={`rounded-xl border p-5 ${c.bg} animate-pulse`}>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
            <div className="h-8 bg-gray-200 rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map(({ key, label, Icon, color, bg }) => (
        <div key={key} className={`rounded-xl border p-5 ${bg}`}>
          <div className="flex items-center gap-2 mb-1">
            <Icon size={18} className={color} />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
          </div>
          <p className={`text-2xl font-bold ${color}`}>${formatMXN(values[key])}</p>
        </div>
      ))}
    </div>
  );
}
