@echo off
title PC Remote & Screen Mirror Server
color 0B
cls

echo ======================================================================
echo    Starting PC Remote & Screen Mirror Server
echo ======================================================================
echo.

:: Check if Python is installed
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your system PATH!
    echo Please install Python 3.10+ from https://www.python.org/
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

:: Test server imports and auto-install dependencies if missing
python -c "import starlette, uvicorn, win32gui" >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] First-time setup detected. Installing required host components...
    echo.
    python -m pip install pywin32 starlette uvicorn
    if %errorlevel% neq 0 (
        echo.
        echo [WARNING] Pip install had warnings, continuing to launch...
    )
)

echo.
echo Launching host server...
echo.

python host\server.py

if errorlevel 1 (
    echo.
    echo [ERROR] Server terminated with an error.
    pause
)
