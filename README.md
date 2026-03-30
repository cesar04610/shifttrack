# ShiftTrack — Control de Horarios

Aplicación web para control de horarios y fichaje de empleados en tienda de abarrotes.
Corre en red local (localhost), accesible desde hasta 4 computadoras.

## Requisitos previos

- **Node.js 18+** — Descargar en https://nodejs.org
- Las computadoras deben estar en la **misma red WiFi o red local**

## Instalación (solo la primera vez)

1. Abre esta carpeta en el Explorador de Windows
2. Doble clic en **`instalar.bat`**
3. Espera a que termine (instala dependencias y crea el admin inicial)

## Iniciar la aplicación

1. Doble clic en **`iniciar.bat`**
2. Abre el navegador en `http://localhost:3000`

**Para las otras 3 computadoras:** usa la IP que muestra la ventana al iniciar, por ejemplo `http://192.168.1.5:3000`

## Acceso inicial

| Campo | Valor |
|-------|-------|
| Email | `admin@tienda.com` |
| Contraseña | `admin123` |
| Rol | Administrador |

> ⚠️ Cambia la contraseña desde el menú **Cambiar contraseña** al primer inicio.

## Configurar alertas de email (opcional)

Si quieres recibir alertas por email cuando un empleado no ficha, edita el archivo `backend/.env`:

```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu_correo@gmail.com
EMAIL_PASS=tu_contraseña_de_aplicacion
ADMIN_EMAIL=correo_para_recibir_alertas@gmail.com
```

> Para Gmail: activa la verificación en 2 pasos y genera una **Contraseña de aplicación** en `myaccount.google.com/security`.

## Guía rápida de uso

### Administrador
- **Empleados** → Crear y gestionar empleados (asigna email y contraseña temporal)
- **Horarios** → Calendario semanal. Clic en `+ turno` para crear. Clic en turno para editar/eliminar
- **Clonar semana** → Copia todos los turnos a la semana siguiente con un clic
- **Reportes** → Ver horas trabajadas, exportar a Excel
- **Alertas** → Configurar tolerancia de ausencias

### Empleado
- Entra a la app con su email y contraseña
- **Mi Horario** → Ver turnos de la semana
- **Fichar** → Botón verde para entrada, rojo para salida

## Estructura del proyecto

```
shifttrack/
├── backend/          # Node.js + Express + SQLite
│   ├── db/           # Base de datos (archivo shifttrack.db)
│   ├── routes/       # auth, employees, schedules, clock, reports
│   ├── middleware/   # JWT y roles
│   ├── services/     # Email (Nodemailer)
│   ├── jobs/         # Verificador de ausencias (cada 5 min)
│   └── index.js      # Servidor principal (puerto 3000)
├── frontend/         # React + Vite + TailwindCSS
│   └── dist/         # Build estático servido por el backend
├── instalar.bat      # Script de instalación
└── iniciar.bat       # Script para iniciar el servidor
```

## Base de datos

El archivo de la base de datos SQLite se crea automáticamente en `backend/db/shifttrack.db`.
**Haz una copia de seguridad de este archivo regularmente.**

Para hacer backup: copia `backend/db/shifttrack.db` a un USB o carpeta segura.
