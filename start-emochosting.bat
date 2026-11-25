@echo off
cd /d "%~dp0"
echo [1/2] Firebase Emulator Suite baslatiliyor (Auth:9099, Firestore:8080, UI:4000)...
start "emoc-firebase-emulators" cmd /k "npx -y firebase-tools@latest emulators:start --project demo-emochosting"
timeout /t 5 /nobreak >nul
echo [2/2] emochosting Backend + Frontend baslatiliyor...
start "emoc-app" cmd /k "npm.cmd run dev"
echo Tarayicinizdan http://localhost:5173 adresini acabilirsiniz.
