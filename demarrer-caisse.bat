@echo off
chcp 65001 > nul
title Caisse - accueil piscine
cd /d "%~dp0"

echo.
echo   Demarrage de la caisse...
echo   Ne fermez pas cette fenetre tant que vous utilisez l'application.
echo.

rem Premiere utilisation (ou apres une mise a jour) : installer et construire.
if not exist "node_modules" (
  echo   Premiere installation, cela prend une minute...
  call npm install || goto :erreur
)
if not exist "client\dist\index.html" (
  echo   Preparation de l'affichage...
  call npm run build || goto :erreur
)

rem Ouvre le navigateur pendant que le serveur demarre.
start "" http://localhost:4173

call npm start
goto :fin

:erreur
echo.
echo   Le demarrage a echoue. Notez le message ci-dessus avant de fermer.
echo.
pause
exit /b 1

:fin
echo.
echo   Application arretee.
pause
