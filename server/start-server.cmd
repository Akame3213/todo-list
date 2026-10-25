@echo off
cd /d "%~dp0.."
node --env-file-if-exists=server/.env server/index.js
pause
