@echo off
cd /d %~dp0
node app.js > log.txt 2>&1
pause