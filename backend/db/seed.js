require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

// Crear usuario admin inicial si no existe ningún usuario
const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();

if (!existingAdmin) {
  const adminId = uuidv4();
  const passwordHash = bcrypt.hashSync('admin123', 10);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, active)
    VALUES (?, ?, ?, ?, 'admin', 1)
  `).run(adminId, 'admin@tienda.com', passwordHash, 'Administrador');

  // Crear configuración de alertas por defecto
  db.prepare(`
    INSERT INTO alert_config (id, admin_id, tolerance_minutes, email_active)
    VALUES (?, ?, 15, 1)
  `).run(uuidv4(), adminId);

  console.log('✅ Usuario administrador creado:');
  console.log('   Email:    admin@tienda.com');
  console.log('   Password: admin123');
  console.log('   ⚠️  Cambia la contraseña después del primer inicio de sesión');
} else {
  console.log('ℹ️  Ya existe un administrador, no se creó ningún usuario nuevo.');
}

process.exit(0);
