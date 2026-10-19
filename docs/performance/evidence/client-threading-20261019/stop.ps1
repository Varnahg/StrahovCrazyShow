$ErrorActionPreference='Stop'
$runtime=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'live/runtime.json') | ConvertFrom-Json
if($runtime.task -ne 'client-threading-lab-20261019' -or $runtime.url -ne 'http://127.0.0.1:4204/') { throw 'Není runtime tohoto tasku.' }
if([IO.Path]::GetFullPath($runtime.cwd) -ne [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'snapshot'))) { throw 'Neshoda identity checkpointu.' }
$verified=@()
foreach($record in $runtime.processes) {
 $live=Get-Process -Id $record.pid -ErrorAction SilentlyContinue
 if(-not $live) { continue }
 if($live.Path -ne $record.path -or $live.StartTime.ToUniversalTime() -ne ([datetime]$record.startUTC).ToUniversalTime()) { throw 'Identita procesu se změnila.' }
 $command=(Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)").CommandLine
 if($command -notmatch 'server/index\.ts|client-threading-lab-20261019[\\/]preview\.mjs') { throw 'Neočekávaný command.' }
 $verified+=$live
}
foreach($live in $verified) { Stop-Process -Id $live.Id }
Write-Output 'Ukončeny pouze vlastní služby CPU lab4204.'
