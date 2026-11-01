$ErrorActionPreference = "Stop"

$sdkDir = "$env:LOCALAPPDATA\Android\Sdk"
$zipPath = "$sdkDir\cmdline-tools.zip"
$extractTemp = "$sdkDir\temp_extract"
$latestDir = "$sdkDir\cmdline-tools\latest"

Write-Host "================================================"
Write-Host " 1. Criando diretórios do Android SDK..."
Write-Host "================================================"
if (!(Test-Path $sdkDir)) {
    New-Item -ItemType Directory -Path $sdkDir -Force | Out-Null
}

$url = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
Write-Host "================================================"
Write-Host " 2. Baixando Android Command Line Tools (~146MB)..."
Write-Host "================================================"
curl.exe -L -o $zipPath $url

Write-Host "================================================"
Write-Host " 3. Extraindo ferramentas..."
Write-Host "================================================"
if (Test-Path $extractTemp) { Remove-Item $extractTemp -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath $extractTemp -Force

if (Test-Path $latestDir) { Remove-Item $latestDir -Recurse -Force }
if (!(Test-Path "$sdkDir\cmdline-tools")) { New-Item -ItemType Directory -Path "$sdkDir\cmdline-tools" -Force | Out-Null }

Move-Item -Path "$extractTemp\cmdline-tools" -Destination $latestDir -Force
Remove-Item $extractTemp -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

Write-Host "================================================"
Write-Host " 4. Configurando licenças e componentes do SDK..."
Write-Host "================================================"
$env:JAVA_HOME = "C:\Users\Pedro\.jdks\corretto-17.0.20.1"
$sdkManager = "$latestDir\bin\sdkmanager.bat"

# Aceita licenças automaticamente
cmd.exe /c "echo y | `"$sdkManager`" --sdk_root=`"$sdkDir`" --licenses"

# Instala plataformas e ferramentas de compilação
& "$sdkManager" --sdk_root="$sdkDir" "platforms;android-34" "build-tools;34.0.0" "platform-tools"

Write-Host "================================================"
Write-Host " 5. Configurando local.properties no projeto..."
Write-Host "================================================"
$localProps = "C:\Users\Pedro\IdeaProjects\Planilha\android\local.properties"
"sdk.dir=" + ($sdkDir -replace '\\', '\\') | Set-Content -Path $localProps -Force

Write-Host "Android SDK configurado com sucesso em: $sdkDir"
