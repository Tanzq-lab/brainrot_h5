@echo off
setlocal

set "PROJECT_DIR=%~dp0"
set "PATCH_ZIP=C:\Users\admi\Downloads\patch.zip"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"

set "TEMP_DIR=%TEMP%\poloball_patch_%STAMP%"

echo.
echo ================================================
echo   PoloBall Patch Apply
echo ================================================
echo Project dir: %PROJECT_DIR%
echo Patch zip  : %PATCH_ZIP%
echo Temp dir   : %TEMP_DIR%
echo.

if not exist "%PATCH_ZIP%" (
    echo [ERROR] Patch zip not found.
    echo %PATCH_ZIP%
    pause
    exit /b 1
)

if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%" >nul 2>nul
mkdir "%TEMP_DIR%" >nul 2>nul

echo [1/3] Extracting patch zip...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%PATCH_ZIP%' -DestinationPath '%TEMP_DIR%' -Force"

if errorlevel 1 (
    echo [ERROR] Failed to extract patch zip.
    rmdir /s /q "%TEMP_DIR%" >nul 2>nul
    pause
    exit /b 1
)

echo.
echo [2/3] Copying patch files directly...
echo Source root: %TEMP_DIR%
echo Target root: %PROJECT_DIR%

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $src='%TEMP_DIR%'; $dst='%PROJECT_DIR%'; Get-ChildItem -LiteralPath $src -Force | Where-Object { $_.Name -ne '__MACOSX' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $dst -Recurse -Force }"

if errorlevel 1 (
    echo [ERROR] File copy failed.
    rmdir /s /q "%TEMP_DIR%" >nul 2>nul
    pause
    exit /b 1
)

echo.
echo [3/3] Cleaning temp files...
rmdir /s /q "%TEMP_DIR%" >nul 2>nul

echo.
echo ================================================
echo Patch applied successfully.
echo ================================================
echo.
pause
exit /b 0
