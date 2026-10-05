@echo off
title Customer Map Potential
cd /d "%~dp0"
where py >nul 2>nul && (py -3 server.py & goto fine)
where python >nul 2>nul && (python server.py & goto fine)
echo.
echo  Python non trovato.
echo  Installa Python 3 da https://www.python.org/downloads/
echo  e durante l'installazione spunta "Add Python to PATH".
echo.
pause
:fine
