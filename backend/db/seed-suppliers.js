require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

// Buscar admin para created_by
const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!admin) {
  console.error('❌ No se encontró un usuario admin. Ejecuta "npm run seed" primero.');
  process.exit(1);
}

const supplierNames = [
  'abarrotes corona',
  'abarrotes el norte',
  'Salsas Que Barbara - colores',
  'Abarrotes Sahuayo',
  'abarrotes Z',
  'aceite notrioli',
  'Aceite transmision',
  'agua de garrafon',
  'alarma',
  'Alma',
  'alsuper',
  'Barbacoa',
  'barcel',
  'barcel cacahuate',
  'bimbo',
  'Tortilleria Sonorense',
  'carbon el terco',
  'carbon la carreta',
  'Carne seca Antigua',
  'Chiltepin de la sierra',
  'carlota AC',
  'carne seca solano',
  'cerveza',
  'cesar',
  'tortillas de harina  dixxi',
  'chicharron anahuac',
  'chicharron don cochi',
  'Chile Colorado por costal',
  'chimex',
  'chocolate y dulce americano',
  'cigarros malaga,zapata,denver',
  'cigarros marlboro',
  'cigarros pallma',
  "clamatos osmar't",
  'coca cola',
  'comercial azul',
  'Camaron seco-marlen',
  'Carne Seca La Vaquita',
  'croquetas nogacan',
  'Cuarto frio',
  'veneno para raton',
  'Doña kina',
  'dulceria arcoiris',
  'dulceria dainy',
  'dulceria goven',
  'dulces cady-juguete',
  'ximena',
  'Eduardo',
  'electrica lovi',
  'encanto',
  'farmacia guadalajara',
  'ferreteria',
  'Food Holguin',
  'frijol costal',
  'frijoles',
  'fruteria morales',
  'gamesa',
  'Gelatinas y natillas Paty',
  'Enpanadas liz',
  'Guillermo',
  'hielo',
  'huevo blanco',
  'huevo ranchero',
  'Infonavit',
  'Iveth',
  'Jamoncillos Eddmar',
  'Jamoncillos Espino',
  'jenny',
  'Jose',
  'jugos chavira',
  'Julexy',
  'jumex',
  'klover',
  'la buena semilla',
  'leche lala',
  'leche zaragoza',
  'leo',
  'Chile colorado casero Andrea',
  'maiz para pozole yaya',
  'miel norteña',
  'mini split',
  'Mondelez',
  'mundo de 10',
  'Orlando',
  'Postres Itxike',
  'paletas y nieves tutto',
  'panaderia ferreiros',
  'panaderia trujano',
  'Papeleria',
  'Paulina',
  'pay casero en rebanadas',
  'pepsi',
  'pilas',
  'Predial',
  'producto santa rosa',
  'Productos el abuelito',
  'Queso clavel',
  'Queso el pino,aldea y pampas',
  'Queso los cienes',
  'queso sello de oro',
  'Queso super finos',
  'recargas',
  'recibo de agua',
  'Rollos de impresoras',
  'sabritas',
  'sabritas tostitos',
  'salsa casera La Sierra-Vaso',
  'salsa casera sierra - Bolsa',
  'salsas del norte',
  'salsas flakita',
  'salsas maxi',
  'SAMS',
  'semilla canadiense',
  'servicios',
  'sopas buldak',
  'Dulces Chamoyito',
  'tamales',
  'telcel-fusion',
  'Alma Bows',
  'Refrigerador (reparacion)',
  'tortillas 5 estrellas frituras',
  'tortillas delicias',
  'tortillas el barzon',
  'tortillas esmeralda',
  'tortillas imperial',
  'tortillas las chiquitas',
  'Tortillas Mazorquin',
  'tortillas mexico',
  'tortillas pimentel',
  'Valeria H',
  'Chamucos',
  'veneno-moscas-jorge',
  'Ximena',
  'señor de salsas de colores',
  'hielo la sierra',
  'salsas hector',
  'Carne Seca Tregon',
];

// Cargar existentes para evitar duplicados
const existing = new Set(
  db.prepare('SELECT company_name FROM suppliers').all().map(r => r.company_name)
);

const insert = db.prepare(`
  INSERT INTO suppliers (id, company_name, rep_name, rep_phone, product_type, created_by)
  VALUES (?, ?, '-', NULL, NULL, ?)
`);

let inserted = 0;
let skipped = 0;

for (const name of supplierNames) {
  const trimmed = name.trim();
  if (!trimmed) continue;
  if (existing.has(trimmed)) {
    skipped++;
    continue;
  }
  insert.run(uuidv4(), trimmed, admin.id);
  existing.add(trimmed);
  inserted++;
}

console.log(`✅ Listo: ${inserted} proveedores insertados, ${skipped} omitidos (ya existían).`);
process.exit(0);
