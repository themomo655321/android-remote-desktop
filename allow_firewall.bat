@echo off
title PC Remote - Allow Windows Firewall
color 0B
cls

echo ======================================================================
echo    PC Remote - Windows Firewall Configuration
echo ======================================================================
echo.

:: Check for Administrator permissions
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Administrator rights required to configure Windows Firewall.
    echo Requesting elevation...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Adding inbound rule for TCP Port 5000...
netsh advfirewall firewall delete rule name="PC Remote Port 5000" >nul 2>&1
netsh advfirewall firewall add rule name="PC Remote Port 5000" dir=in action=allow protocol=TCP localport=5000 profile=any >nul

if %errorlevel% equ 0 (
    echo.
    echo ======================================================================
    echo  [SUCCESS] Port 5000 is now open on Windows Firewall!
    echo  Your tablet and other devices can now connect freely.
    echo ======================================================================
) else (
    echo.
    echo [ERROR] Failed to add firewall rule. Please run as Administrator.
)

echo.
pause
