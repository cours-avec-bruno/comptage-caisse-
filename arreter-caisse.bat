@echo off
chcp 65001 > nul
title Caisse - arret

rem Le serveur tourne sans fenetre : il n'y a rien a fermer a la souris.
rem On le retrouve par le port qu'il occupe.

set TROUVE=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":4173 .*LISTENING"') do (
  taskkill /pid %%p /f > nul 2>&1 && set TROUVE=1
)

if "%TROUVE%"=="1" (
  echo   Caisse arretee.
) else (
  echo   La caisse ne tournait pas.
)

timeout /t 3 > nul
