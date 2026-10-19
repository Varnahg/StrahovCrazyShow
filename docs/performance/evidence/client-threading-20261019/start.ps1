$ErrorActionPreference='Stop'
$sourceRoot=Join-Path $PSScriptRoot 'snapshot'
$runRoot=Join-Path $PSScriptRoot 'live'
if(Test-Path -LiteralPath $runRoot) { throw 'Zachovat existující live runtime.' }
foreach($port in @(4204,2599)) { if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Rezervovaný port $port je obsazený." } }
New-Item -ItemType Directory -Path $runRoot | Out-Null
$snapshot=(Get-Content -Raw -LiteralPath (Join-Path $sourceRoot 'source-manifest.json') | ConvertFrom-Json).snapshotId
$env:GIT_CEILING_DIRECTORIES=$PSScriptRoot
$env:TSX_DISABLE_CACHE='1'
$env:HOST='127.0.0.1'
$env:PORT='2599'
$env:STRAHOV_SOURCE_SNAPSHOT_ID=$snapshot
$nodeExecutable=(Get-Command node).Source
$started=@()
try {
 $api=Start-Process -FilePath $nodeExecutable -ArgumentList @('--import','tsx','server/index.ts') -WorkingDirectory $sourceRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot 'api.stdout.log') -RedirectStandardError (Join-Path $runRoot 'api.stderr.log')
 $started+=$api
 $preview=Start-Process -FilePath $nodeExecutable -ArgumentList @((Join-Path $PSScriptRoot 'preview.mjs')) -WorkingDirectory $sourceRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot 'preview.stdout.log') -RedirectStandardError (Join-Path $runRoot 'preview.stderr.log')
 $started+=$preview
 $records=@($started | ForEach-Object { @{pid=$_.Id;startUTC=$_.StartTime.ToUniversalTime().ToString('o');path=$_.Path} })
 @{snapshotId=$snapshot;cwd=$sourceRoot;url='http://127.0.0.1:4204/';apiPort=2599;task='client-threading-lab-20261019';owner='threading-01a15535-lab';processes=$records} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $runRoot 'runtime.json')
 $deadline=(Get-Date).AddSeconds(50)
 do {
  Start-Sleep -Milliseconds 300
  if($api.HasExited -or $preview.HasExited) { throw 'Vlastní služba skončila před připraveností.' }
  try { $health=Invoke-RestMethod -Uri 'http://127.0.0.1:2599/api/health' -TimeoutSec 2; $html=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4204/' -TimeoutSec 2; if($health.ok -and $html.StatusCode -eq 200) { Write-Output "READY $snapshot http://127.0.0.1:4204/?renderBackend=webgpu&profileEnvironment=1"; exit 0 } } catch {}
 } while((Get-Date) -lt $deadline)
 throw 'Timeout ověření připravenosti preview/API.'
} catch {
 foreach($process in $started) { $live=Get-Process -Id $process.Id -ErrorAction SilentlyContinue; if($live -and $live.StartTime -eq $process.StartTime -and $live.Path -eq $process.Path) { Stop-Process -Id $live.Id } }
 throw
}
