@echo off
title Setup PC Remote Host on Laptop 2
color 0A
cls

echo ======================================================================
echo    PC Remote - One-Click Host Setup for Laptop #2
echo ======================================================================
echo.

set "TARGET_DIR=%USERPROFILE%\Desktop\PCRemote-Host"
set "REPO_ZIP=https://github.com/themomo655321/android-remote-desktop/archive/refs/heads/main.zip"
set "TEMP_ZIP=%TEMP%\pcremote_main.zip"

echo [1/3] Downloading latest PC Remote files from GitHub...
curl.exe -fSL "%REPO_ZIP%" -o "%TEMP_ZIP%"
if %errorlevel% neq 0 (
    echo [ERROR] Failed to download from GitHub. Please check your internet connection.
    pause
    exit /b 1
)

echo [2/3] Extracting to %TARGET_DIR%...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
powershell -Command "Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP%\pcremote_extract' -Force"
xcopy /E /Y "%TEMP%\pcremote_extract\android-remote-desktop-main\*" "%TARGET_DIR%\" >nul
del /f /q "%TEMP_ZIP%" >nul 2>nul
rmdir /s /q "%TEMP%\pcremote_extract" >nul 2>nul

echo [3/3] Creating Desktop Shortcut...
set "SHORTCUT=%USERPROFILE%\Desktop\Start PC Remote.lnk"
powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT%'); $s.TargetPath='%TARGET_DIR%\start_server.bat'; $s.WorkingDirectory='%TARGET_DIR%'; $s.Save()"

echo.
echo ======================================================================
echo  SUCCESS! PC Remote Host is installed on this laptop!
echo  A shortcut named 'Start PC Remote' has been created on your Desktop.
echo ======================================================================
echo.
echo Launching server now...
cd /d "%TARGET_DIR%"
start "" "%TARGET_DIR%\start_server.bat"
