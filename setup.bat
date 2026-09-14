@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Please install Python 3.11 or newer with the Python launcher.
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.12 or newer.
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
  if errorlevel 1 exit /b 1
)
".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 exit /b 1
pushd frontend
call npm.cmd ci
if errorlevel 1 (
  popd
  exit /b 1
)
call npm.cmd run build
if errorlevel 1 (
  popd
  exit /b 1
)
popd
".venv\Scripts\python.exe" -m backend.app.cli bootstrap
if errorlevel 1 exit /b 1
echo Setup complete. Run start_files_app.bat to start Files-App.
