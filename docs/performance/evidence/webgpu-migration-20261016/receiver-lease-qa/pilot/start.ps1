param([Parameter(Mandatory=$true)][ValidateSet('reference','candidate-v1')][string]$Source,[Parameter(Mandatory=$true)][ValidateSet('a1','m1','a2','a3','m2','a4','m3')][string]$RunId)
$ErrorActionPreference='Stop'
$sourceRoot=Join-Path $PSScriptRoot $Source
$runRoot=Join-Path $PSScriptRoot ('runs/'+$RunId)
if(Test-Path -LiteralPath $runRoot) { throw 'Preserve existing run.' }
foreach($port in @(4200,2595)) { if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Reserved port $port in use." } }
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
$snapshot=(Get-Content -Raw -LiteralPath (Join-Path $sourceRoot 'source-manifest.json') | ConvertFrom-Json).snapshotId
$env:GIT_CEILING_DIRECTORIES=$PSScriptRoot
$env:TSX_DISABLE_CACHE='1'
$env:HOST='127.0.0.1'
$env:PORT='2595'
$env:STRAHOV_SOURCE_SNAPSHOT_ID=$snapshot
$nodeExecutable=(Get-Command node).Source
$started=@()
try {
 $api=Start-Process -FilePath $nodeExecutable -ArgumentList @('--import','tsx','server/index.ts') -WorkingDirectory $sourceRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot 'api.stdout.log') -RedirectStandardError (Join-Path $runRoot 'api.stderr.log')
 $started+=$api
 $preview=Start-Process -FilePath $nodeExecutable -ArgumentList @((Join-Path $PSScriptRoot 'preview.mjs')) -WorkingDirectory $sourceRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot 'preview.stdout.log') -RedirectStandardError (Join-Path $runRoot 'preview.stderr.log')
 $started+=$preview
 $records=@($started | ForEach-Object { @{pid=$_.Id;startUTC=$_.StartTime.ToUniversalTime().ToString('o');path=$_.Path} })
 @{snapshotId=$snapshot;cwd=$sourceRoot;source=$Source;run=$RunId;url='http://127.0.0.1:4200/';apiPort=2595;task='webgpu-receiver-lease-qa-20261019';owner='webgpu-01a15102-receiver-lease';processes=$records} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $runRoot 'runtime.json')
 $deadline=(Get-Date).AddSeconds(50)
 do {
  Start-Sleep -Milliseconds 300
  if($api.HasExited -or $preview.HasExited) { throw 'Owned service exited before readiness.' }
  try { $health=Invoke-RestMethod -Uri 'http://127.0.0.1:2595/api/health' -TimeoutSec 2; $html=Invoke-WebRequest -Uri 'http://127.0.0.1:4200/' -TimeoutSec 2; if($health.ok -and $html.StatusCode -eq 200) { Write-Output "READY $RunId $snapshot http://127.0.0.1:4200/"; exit 0 } } catch {}
 } while((Get-Date) -lt $deadline)
 throw 'Preview/API readiness timeout.'
} catch {
 foreach($process in $started) { $live=Get-Process -Id $process.Id -ErrorAction SilentlyContinue; if($live -and $live.StartTime -eq $process.StartTime -and $live.Path -eq $process.Path) { Stop-Process -Id $live.Id } }
 throw
}
