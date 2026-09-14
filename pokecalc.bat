@echo off
rem Double-click entry point: opens the Dynamic Calc menu.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pokecalc.ps1" -Action menu
if errorlevel 1 pause
