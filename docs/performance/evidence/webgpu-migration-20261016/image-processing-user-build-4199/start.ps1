$ErrorActionPreference='Stop'
$sourceRoot=Join-Path $PSScriptRoot 'snapshot'
$runRoot=Join-Path $PSScriptRoot 'runtime'
if(Test-Path -LiteralPath $runRoot) { throw 'Preserve existing runtime record.' }
foreach($port in @(4199,2594)) { if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Reserved port $port is occupied." } }
New-Item -ItemType Directory -Path $runRoot | Out-Null
$nodeExecutable=(Get-Command node).Source
$snapshot=(Get-Content -Raw -LiteralPath (Join-Path $sourceRoot 'source-manifest.json') | ConvertFrom-Json).snapshotId
$env:GIT_CEILING_DIRECTORIES=$PSScriptRoot
$env:TSX_DISABLE_CACHE='1'
$env:HOST='127.0.0.1'
$env:PORT='2594'
$env:STRAHOV_SOURCE_SNAPSHOT_ID=$snapshot
$started=@()
try {
  $api=Start-Process -FilePath $nodeExecutable -ArgumentList @('--import','tsx','server/index.ts') -WorkingDirectory $sourceRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot 'api.stdout.log') -RedirectStandardError (Join-Path $runRoot 'api.stderr.log')
  $started+=$api
  $preview=Start-Process -FilePath $nodeExecutable -ArgumentList @((Join-Path $PSScriptRoot 'preview.mjs')) -WorkingDirectory $sourceRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot 'preview.stdout.log') -RedirectStandardError (Join-Path $runRoot 'preview.stderr.log')
  $started+=$preview
  $records=@($started | ForEach-Object { @{pid=$_.Id;startUTC=$_.StartTime.ToUniversalTime().ToString('o');path=$_.Path} })
  @{snapshotId=$snapshot;cwd=$sourceRoot;url='http://127.0.0.1:4199/?renderBackend=webgpu';apiPort=2594;task='webgpu-image-processing-user-build-20261018';owner='webgpu-image-processing-user-build-01a14497';processes=$records} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $runRoot 'runtime.json')
  $deadline=(Get-Date).AddSeconds(50)
  do {
    Start-Sleep -Milliseconds 300
    if($api.HasExited -or $preview.HasExited) { throw 'Owned service exited before readiness.' }
    try { $health=Invoke-RestMethod -Uri 'http://127.0.0.1:2594/api/health' -TimeoutSec 2; $html=Invoke-WebRequest -Uri 'http://127.0.0.1:4199/' -TimeoutSec 2; if($health.ok -and $html.StatusCode -eq 200) { Write-Output "READY $snapshot http://127.0.0.1:4199/?renderBackend=webgpu"; exit 0 } } catch {}
  } while((Get-Date) -lt $deadline)
  throw 'Preview/API readiness timeout.'
} catch {
  foreach($process in $started) { $live=Get-Process -Id $process.Id -ErrorAction SilentlyContinue; if($live -and $live.StartTime -eq $process.StartTime -and $live.Path -eq $process.Path) { Stop-Process -Id $live.Id } }
  throw
}
