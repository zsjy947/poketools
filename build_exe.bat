@echo off



chcp 65001 >nul



REM PokéTools build script: produces dist\Poketools.exe



REM Usage: run build_exe.bat in repo root.



REM After build: put Poketools.exe and the data\ folder together and double-click the exe.







cd /d "%~dp0"







pyinstaller --noconsole --onefile --name Poketools ^



  --icon app/static/dist/assets/appicon.ico ^



  --distpath . --workpath build --specpath . ^



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







echo.



echo [OK] Poketools.exe (in repo root, data folder is already next to it)



echo Usage: double-click Poketools.exe. To share: copy Poketools.exe + data folder together.



echo (data folder needs poketools.db and sprites\; run the data pipeline scripts first)



pause




