// Fijar zona horaria de México ANTES de cualquier otro módulo
process.env.TZ = process.env.TZ || 'America/Chihuahua';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const auth = require('./middleware/auth');
const { startAbsenceChecker } = require('./jobs/absenceChecker');
const { startTaskGenerator } = require('./jobs/taskGenerator');
const { startTaskSummaryJob } = require('./jobs/taskSummaryJob');
const { startCutsMissingJob } = require('./jobs/cutsMissingJob');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Migraciones al iniciar ─────────────────────────────────────────────────
const db = require('./db/database');
const bcrypt = require('bcryptjs');

// Hacer name UNIQUE si no lo es aún (para login por nombre)
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name ON users(name)"); } catch {}

// Migración: agregar columna 'date' a cash_register_cuts si no existe
try {
  db.prepare("SELECT date FROM cash_register_cuts LIMIT 0").run();
} catch {
  try {
    db.exec("ALTER TABLE cash_register_cuts ADD COLUMN date TEXT");
    // Rellenar date desde schedules para registros existentes
    db.exec(`
      UPDATE cash_register_cuts SET date = (
        SELECT s.date FROM schedules s WHERE s.id = cash_register_cuts.schedule_id
      ) WHERE date IS NULL AND schedule_id IS NOT NULL
    `);
  } catch {}
}

// Actualizar admin: name='admin' para login por nombre
const adminUser = db.prepare("SELECT id, name FROM users WHERE role = 'admin' LIMIT 1").get();
if (adminUser && adminUser.name !== 'admin') {
  db.prepare("UPDATE users SET name = 'admin' WHERE id = ?").run(adminUser.id);
}
// Si no existe admin, crear uno
if (!adminUser) {
  const { v4: uuidv4 } = require('uuid');
  db.prepare(
    "INSERT INTO users (id, email, password_hash, name, role, active) VALUES (?, ?, ?, ?, 'admin', 1)"
  ).run(uuidv4(), null, bcrypt.hashSync('admin123', 10), 'admin');
}

// Middleware
app.use(cors());
app.use(express.json());

// Rutas API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/clock', require('./routes/clock'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/tasks', require('./routes/tasks'));

// Módulo de Compra de Proveedores
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/analytics', require('./routes/analytics'));

// Módulo de Cortes de Caja
app.use('/api/cuts', require('./routes/cuts'));

// Módulo de Faltantes de Producto
app.use('/api/shortages', require('./routes/shortages'));

// Servir fotos de evidencia de tareas (requiere autenticación)
const uploadsPath = process.env.UPLOADS_PATH
  ? path.resolve(process.env.UPLOADS_PATH)
  : path.join(__dirname, 'uploads', 'tasks');
app.use('/uploads/tasks', (req, res, next) => {
  // Aceptar token por query param para <img src=""> que no envía headers
  if (!req.headers['authorization'] && req.query.token) {
    req.headers['authorization'] = `Bearer ${req.query.token}`;
  }
  next();
}, auth, express.static(uploadsPath));

// Servir el frontend React (build estático)
const frontendBuild = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendBuild));

// SPA fallback: cualquier ruta que no sea API devuelve el index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuild, 'index.html'));
});

// Iniciar cron jobs
startAbsenceChecker();
startTaskGenerator();
startTaskSummaryJob();
startCutsMissingJob();

// Escuchar en 0.0.0.0 para que todas las computadoras de la red puedan acceder
app.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
  }

  console.log('\n==========================================');
  console.log('  ✅  Mostrador Modelorama está corriendo');
  console.log('==========================================');
  console.log(`  Esta computadora:   http://localhost:${PORT}`);
  console.log(`  Red local:          http://${localIP}:${PORT}`);
  console.log('  (Comparte la URL de Red local con las demás computadoras)');
  console.log('==========================================\n');
});
