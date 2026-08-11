@echo off
chcp 65001 > nul
title Caisse - raccourci
cd /d "%~dp0"

rem A lancer une seule fois, apres avoir copie le dossier sur le PC.
cscript //nologo "scripts\poser-raccourci.vbs" || goto :erreur

echo.
echo   L'icone "Caisse piscine" est sur le Bureau et dans le menu Demarrer.
echo.
timeout /t 5 > nul
exit /b 0

:erreur
echo.
echo   La creation du raccourci a echoue.
echo.
pause
exit /b 1
