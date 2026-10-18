param([switch]$Http,[int]$Port=5173)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath -or $nodePath -like '*WindowsApps*') {
 $bundledNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
 if (Test-Path -LiteralPath $bundledNode) { $nodePath=$bundledNode }
}
if (-not $nodePath) { throw 'Install Node.js 22 or newer, then run Start.ps1 again.' }
if (-not (Test-Path node_modules/tsx)) { throw 'Install dependencies first: pnpm install (or npm install).' }
if (-not (Test-Path dist/index.html)) {
 & $nodePath node_modules/typescript/bin/tsc --noEmit
 if ($LASTEXITCODE -ne 0) { throw 'Type check failed.' }
 & $nodePath node_modules/vite/bin/vite.js build
 if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
}
$env:PORT="$Port"
$env:NODE_ENV='production'
if (-not $Http) {
 $certFile=Join-Path $PSScriptRoot '.cert/localhost.pem'
 $keyFile=Join-Path $PSScriptRoot '.cert/localhost-key.pem'
 if (-not (Test-Path $certFile) -or -not (Test-Path $keyFile)) { throw 'Set up HTTPS first using scripts/Setup-Https.ps1, or use ./Start.ps1 -Http for PC-only checks.' }
 $env:TLS_CERT=$certFile;$env:TLS_KEY=$keyFile
} else { Remove-Item Env:TLS_CERT,Env:TLS_KEY -ErrorAction SilentlyContinue }
& $nodePath --import tsx server.ts
