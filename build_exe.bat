@echo off
chcp 65001 >nul

REM PokéTools build script: produces release\poketools\Poketools.exe + data

REM Usage: run build_exe.bat in repo root (data pipeline must have been run first).

REM After build: release\poketools\ = exe + data, copy that whole folder to share;
REM double-click Poketools.exe on the target machine (WebView2 runtime required, Win10/11 usually built-in).

cd /d "%~dp0"

pyinstaller --noconsole --onefile --name Poketools ^
  --icon app/static/dist/assets/appicon.ico ^
  --distpath release/poketools --workpath build --specpath . ^
  --paths . ^
  --add-data "app\static\dist;app\static\dist" ^
  --collect-submodules uvicorn ^
  --collect-all webview ^
  launcher.pyw

if errorlevel 1 (
  echo.
  echo [FAIL] build error, check log above.
  pause
  exit /b 1
)

REM 运行依赖：静态库与图片（userstate.db 首次运行自建）
if not exist release\poketools\data mkdir release\poketools\data
copy /y data\poketools.db release\poketools\data\ >nul
echo D | xcopy /e /i /y data\sprites release\poketools\data\sprites >nul

echo.
echo [OK] release\poketools\Poketools.exe  (+ data\poketools.db, data\sprites\)
echo Usage: copy the whole release\poketools\ folder; double-click Poketools.exe.
echo (release\ is gitignored; rebuild any time with this script)
pause
