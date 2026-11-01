@echo off
title Gerador de APK - Planilha de Gastos Mensais
chcp 65001 > nul

echo ========================================================
echo   COMPILADOR DE APK ANDROID - PLANILHA DE GASTOS
echo ========================================================
echo.

cd /d "%~dp0"

REM 1. Sincroniza arquivos web com o projeto Android
echo [1/4] Atualizando arquivos da aplicação no Android...
set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "node_modules\@capacitor\cli\bin\capacitor" (
    call "C:\Program Files\nodejs\node.exe" .\node_modules\@capacitor\cli\bin\capacitor copy android
)

REM 2. Configura JDK
echo [2/4] Verificando Java (JDK)...
if exist "%USERPROFILE%\.jdks\corretto-17.0.20.1" (
    set "JAVA_HOME=%USERPROFILE%\.jdks\corretto-17.0.20.1"
) else if exist "C:\Program Files\JetBrains\IntelliJ IDEA 2026.1.1\jbr" (
    set "JAVA_HOME=C:\Program Files\JetBrains\IntelliJ IDEA 2026.1.1\jbr"
)
if "%JAVA_HOME%"=="" (
    echo [AVISO] JAVA_HOME nao esta configurado. Usando java padrao do sistema.
) else (
    echo Usando JDK em: %JAVA_HOME%
)

REM 3. Verifica Android SDK
echo [3/4] Verificando Android SDK...
if "%ANDROID_HOME%"=="" (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
    )
)

if not exist "android\local.properties" (
    if not "%ANDROID_HOME%"=="" (
        echo sdk.dir=%ANDROID_HOME:\=\\%> android\local.properties
    )
)

REM 4. Compilação do APK
echo [4/4] Executando Gradle para gerar o APK...
cd android
call gradlew.bat assembleDebug

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo   SUCESSO! O APK FOI GERADO!
    echo ========================================================
    cd ..
    if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
        copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "Planilha_Gastos.apk" > nul
        echo.
        echo Arquivo pronto em:
        echo %~dp0Planilha_Gastos.apk
        echo.
        echo Voce ja pode enviar este arquivo .apk para o seu celular!
    )
) else (
    echo.
    echo ========================================================
    echo   INFORMAÇÃO IMPORTANTE PARA GERAR O APK
    echo ========================================================
    echo Para compilar o arquivo nativo .apk pela primeira vez,
    echo o Android necessita das bibliotecas do Android SDK.
    echo.
    echo Opcoes simples para gerar:
    echo 1. Abrir a pasta 'android' no Android Studio e clicar em:
    echo    Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
    echo.
    echo 2. Ou usar a versao Web instalavel (PWA):
    echo    Abra a planilha no celular pelo navegador e toque em
    echo    'Adicionar a Tela Inicial' para ter o App instalado instantaneamente!
    echo ========================================================
)

pause
