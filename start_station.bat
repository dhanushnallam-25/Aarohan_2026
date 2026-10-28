@echo off
title AAROHAN '26 - TIMEGLITCH: THE LOST SPACE TRANSMISSION
echo ============================================================
echo   AAROHAN '26 -- TIMEGLITCH: THE LOST SPACE TRANSMISSION
echo   Central Event Registry & Station 1 Challenge
echo ============================================================
echo.
echo Starting TIMEGLITCH Server at http://localhost:5000 ...
echo Opening TIMEGLITCH mission in your default browser...
echo.
echo Keep this command prompt window OPEN while playing.
echo.
timeout /t 2 /nobreak >nul 2>&1
start "" "http://localhost:5000/game.html"
cd backend
python app.py
pause
