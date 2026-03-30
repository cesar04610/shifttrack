@echo off
echo ==========================================
echo   ShiftTrack - Instalacion
echo ==========================================
echo.

echo [1/4] Instalando dependencias del backend...
cd backend
call npm install
if errorlevel 1 (echo ERROR en backend && pause && exit /b 1)

echo.
echo [2/4] Creando archivo de configuracion .env...
if not exist .env (
  copy .env.example .env
  echo    Archivo .env creado. Edita backend\.env si necesitas configurar email.
) else (
  echo    .env ya existe, no se sobreescribio.
)

echo.
echo [3/4] Instalando dependencias del frontend...
cd ..\frontend
call npm install
if errorlevel 1 (echo ERROR en frontend && pause && exit /b 1)

echo.
echo [4/4] Construyendo frontend...
call npm run build
if errorlevel 1 (echo ERROR al construir frontend && pause && exit /b 1)

cd ..

echo.
echo [5/5] Creando usuario administrador inicial...
cd backend
call node db/seed.js
cd ..

echo.
echo ==========================================
echo   Instalacion completada!
echo ==========================================
echo.
echo   Para iniciar la aplicacion ejecuta:
echo     iniciar.bat
echo.
pause
