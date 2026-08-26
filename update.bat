@echo off
setlocal
cd /d "%~dp0"

echo.
echo Updating Social Media Panel from GitHub...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-project.ps1" %*
set EXITCODE=%ERRORLEVEL%

echo.
if %EXITCODE% equ 0 (
  echo Success.
) else if %EXITCODE% equ 2 (
  echo Updated code, but deploy was skipped. Check Cloudflare login.
) else (
  echo Failed. See messages above.
)

echo.
pause
exit /b %EXITCODE%
