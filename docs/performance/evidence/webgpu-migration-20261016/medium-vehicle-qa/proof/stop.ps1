param([Parameter(Mandatory=$true)][ValidateSet('g1','c1','n1','c2','n2','g2','n3','g3','c3','x1','x2','x3')][string]$RunId)
$ErrorActionPreference='Stop'
$runtime=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ('runs/'+$RunId+'/runtime.json')) | ConvertFrom-Json
if($runtime.task -ne 'webgpu-medium-vehicle-qa-20261019' -or $runtime.url -ne 'http://127.0.0.1:4200/') { throw 'Není runtime tohoto tasku.' }
$allowed=@('snapshot','control','attribution') | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $_)) }
if([IO.Path]::GetFullPath($runtime.cwd) -notin $allowed) { throw 'Neshoda identity checkpointu.' }
if($runtime.run -ne $RunId) { throw 'Neshoda RunId.' }
$verified=@()
foreach($record in $runtime.processes) {
 $live=Get-Process -Id $record.pid -ErrorAction SilentlyContinue
 if(-not $live) { continue }
 if($live.Path -ne $record.path -or $live.StartTime.ToUniversalTime() -ne ([datetime]$record.startUTC).ToUniversalTime()) { throw 'Identita procesu se změnila.' }
 $command=(Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)").CommandLine
 if($command -notmatch 'server/index\.ts|webgpu-medium-vehicle-qa-20261019[\\/]preview\.mjs') { throw 'Neočekávaný command.' }
 $verified+=$live
}
foreach($live in $verified) { Stop-Process -Id $live.Id }
Write-Output 'Ukončeny pouze vlastní služby F3 user4200.'
