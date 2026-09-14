@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  call setup.bat
  if errorlevel 1 goto failed
)
if not exist "frontend\dist\index.html" (
  call setup.bat
  if errorlevel 1 goto failed
)
".venv\Scripts\python.exe" -m backend.app.cli bootstrap
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m backend.app.launcher
if errorlevel 1 goto failed
exit /b 0
:failed
echo Files-App did not start. See the error above.
pause
exit /b 1
