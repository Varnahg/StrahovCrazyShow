param([Parameter(Mandatory=$true)][ValidateSet('g1','c1','n1','c2','n2','g2','n3','g3','c3','x1','x2','x3')][string]$RunId)
$ErrorActionPreference='Stop'
$protocol=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'protocol.json') | ConvertFrom-Json
$entry=@($protocol.runs | Where-Object { $_.id -eq $RunId })
if($entry.Count -ne 1) { throw 'Invalid protocol run' }
$directory=if($entry[0].directory -in @('control','attribution')) {$entry[0].directory} else {'snapshot'}
$sourceRoot=Join-Path $PSScriptRoot $directory
$runRoot=Join-Path $PSScriptRoot ('runs/'+$RunId)
if(Test-Path -LiteralPath $runRoot) { throw 'Zachovat existující live runtime.' }
foreach($port in @(4200,2595)) { if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Rezervovaný port $port je obsazený." } }
New-Item -ItemType Directory -Path $runRoot | Out-Null
$snapshot=(Get-Content -Raw -LiteralPath (Join-Path $sourceRoot 'source-manifest.json') | ConvertFrom-Json).snapshotId
$env:GIT_CEILING_DIRECTORIES=$PSScriptRoot
$env:TSX_DISABLE_CACHE='1'
$env:HOST='127.0.0.1'
$env:PORT='2595'
$env:STRAHOV_SOURCE_SNAPSHOT_ID=$snapshot
$nodeExecutable=(Get-Command node).Source
$protocol=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'protocol.json') | ConvertFrom-Json
$selected=@($protocol.runs | Where-Object { $_.id -eq $RunId })
if($selected.Count -ne 1) { throw 'RunId nemá právě jeden protokol.' }
$backend=$selected[0].backend
$started=@()
try {
 $api=Start-Process -FilePath $nodeExecutable -ArgumentList @('--import','tsx','server/index.ts') -WorkingDirectory $sourceRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot 'api.stdout.log') -RedirectStandardError (Join-Path $runRoot 'api.stderr.log')
 $started+=$api
 $preview=Start-Process -FilePath $nodeExecutable -ArgumentList @((Join-Path $PSScriptRoot 'preview.mjs')) -WorkingDirectory $sourceRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot 'preview.stdout.log') -RedirectStandardError (Join-Path $runRoot 'preview.stderr.log')
 $started+=$preview
 $records=@($started | ForEach-Object { @{pid=$_.Id;startUTC=$_.StartTime.ToUniversalTime().ToString('o');path=$_.Path} })
 @{snapshotId=$snapshot;backend=$backend;run=$RunId;cwd=$sourceRoot;url='http://127.0.0.1:4200/';apiPort=2595;task='webgpu-medium-vehicle-qa-20261019';owner='webgpu-01a15102-medium-vehicle-qa';processes=$records} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $runRoot 'runtime.json')
 $deadline=(Get-Date).AddSeconds(50)
 do {
  Start-Sleep -Milliseconds 300
  if($api.HasExited -or $preview.HasExited) { throw 'Vlastní služba skončila před připraveností.' }
  try { $health=Invoke-RestMethod -Uri 'http://127.0.0.1:2595/api/health' -TimeoutSec 2; $html=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4200/' -TimeoutSec 2; if($health.ok -and $html.StatusCode -eq 200) { Write-Output "READY $snapshot http://127.0.0.1:4200/?renderBackend=$backend"; exit 0 } } catch {}
 } while((Get-Date) -lt $deadline)
 throw 'Timeout ověření připravenosti preview/API.'
} catch {
 foreach($process in $started) { $live=Get-Process -Id $process.Id -ErrorAction SilentlyContinue; if($live -and $live.StartTime -eq $process.StartTime -and $live.Path -eq $process.Path) { Stop-Process -Id $live.Id } }
 throw
}
