// Fijar timezone de México ANTES de cualquier uso de Date
process.env.TZ = process.env.TZ || 'America/Chihuahua';

/**
 * Devuelve la fecha local de hoy en formato 'YYYY-MM-DD'.
 */
function getLocalToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Devuelve un timestamp local en formato 'YYYY-MM-DD HH:MM:SS' (sin zona).
 * Usar en lugar de toISOString() para almacenar en SQLite.
 */
function getLocalISOString(date) {
  const now = date || new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');
}

module.exports = { getLocalToday, getLocalISOString };
