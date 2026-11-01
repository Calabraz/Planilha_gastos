@echo off
title Planilha de Gastos Mensais
chcp 65001 > nul

echo ========================================================
echo   INICIANDO PLANILHA DE GASTOS MENSAIS (NODE.JS)
echo ========================================================
echo.

set "NODE_CMD=node"
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_CMD=C:\Program Files\nodejs\node.exe"
    ) else (
        echo [ERRO] Node.js nao foi encontrado no sistema!
        pause
        exit /b 1
    )
)

echo [1/2] Abrindo navegador...
start http://localhost:3000

echo [2/2] Iniciando servidor Node.js...
echo Servidor ativo na porta 3000.
echo Pressione Ctrl+C para encerrar.
echo.

"%NODE_CMD%" server.js
pause
