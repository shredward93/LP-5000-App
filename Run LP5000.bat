@echo off
cd /d "%~dp0"
echo ----------------------------------------
echo  Starting LP 5000 Smart Engine...
echo ----------------------------------------
if not exist node_modules (
  echo First run - installing dependencies (this only happens once)...
  call npm install
)
call npm start
