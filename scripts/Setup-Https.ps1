param([Parameter(Mandatory=$true)][string]$LaptopAddress,[string]$Mkcert='mkcert')
$ErrorActionPreference='Stop'
$prototypeRoot = Split-Path -Parent $PSScriptRoot
if ($LaptopAddress -match '[:/\\\s]') { throw 'Supply only the laptop IPv4 address or hostname, without scheme or port.' }
New-Item -ItemType Directory -Force -Path (Join-Path $prototypeRoot '.cert') | Out-Null
& $Mkcert -install
if ($LASTEXITCODE -ne 0) { throw 'mkcert trust installation failed.' }
& $Mkcert -cert-file (Join-Path $prototypeRoot '.cert/localhost.pem') -key-file (Join-Path $prototypeRoot '.cert/localhost-key.pem') localhost 127.0.0.1 ::1 $LaptopAddress
if ($LASTEXITCODE -ne 0) { throw 'Certificate generation failed.' }
$caRoot = & $Mkcert -CAROOT
Copy-Item -LiteralPath (Join-Path $caRoot 'rootCA.pem') -Destination (Join-Path $prototypeRoot '.cert/phone-rootCA.crt')
Write-Output 'Local certificate ready. Install and fully trust .cert/phone-rootCA.crt on the phone. Never share rootCA-key.pem or localhost-key.pem.'
