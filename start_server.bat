@echo off
title Antigravity PC Remote & Mirror Server
color 0B
cls
echo ======================================================================
echo    Starting Antigravity Remote Desktop & Controller for Android
echo ======================================================================
echo.

python host\server.py

if errorlevel 1 (
    echo.
    echo [ERROR] Server terminated with an error.
    pause
)
