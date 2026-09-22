@echo off
chcp 65001 >nul
REM PokéTools build script: produces dist\Poketools.exe
REM Usage: run build_exe.bat in repo root.
REM After build: put Poketools.exe and the data\ folder together and double-click the exe.

cd /d "%~dp0"

pyinstaller --noconsole --onefile --name Poketools ^
  --paths . ^
  --add-data "app\static\dist;app\static\dist" ^
  --collect-submodules uvicorn ^
  launcher.pyw

if errorlevel 1 (
  echo.
  echo [FAIL] build error, check log above.
  pause
  exit /b 1
)

echo.
echo [OK] dist\Poketools.exe
echo Usage: copy Poketools.exe to any folder, put the data folder next to it, double click.
echo (data folder needs poketools.db and sprites\; run the data pipeline scripts first)
pause
