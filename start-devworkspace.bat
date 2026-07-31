@echo off
REM Launches DevWorkspace (backend + frontend) in a Git Bash terminal.
start "" "C:\Program Files\Git\git-bash.exe" "C:\Users\vitor\repositorios\devworkspace\start.sh"

REM Wait for the frontend dev server to come up, then open it in the default browser.
set URL=http://localhost:5173
set /a COUNT=0

:WAITLOOP
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }"
if %ERRORLEVEL%==0 goto OPEN
set /a COUNT+=1
if %COUNT% GEQ 30 goto OPEN
timeout /t 1 /nobreak >nul
goto WAITLOOP

:OPEN
start "" %URL%
