$ErrorActionPreference='Stop'
$runtime=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'run-01/runtime.json') | ConvertFrom-Json
if($runtime.task -ne 'webgpu-cpu-profile-20261018' -or $runtime.url -ne 'http://127.0.0.1:4200/') { throw 'Not this task runtime.' }
if([IO.Path]::GetFullPath($runtime.cwd) -ne [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'candidate-v2'))) { throw 'Checkpoint identity mismatch.' }
$verified=@()
foreach($record in $runtime.processes) {
 $live=Get-Process -Id $record.pid -ErrorAction SilentlyContinue
 if(-not $live) { continue }
 if($live.Path -ne $record.path -or $live.StartTime.ToUniversalTime() -ne ([datetime]$record.startUTC).ToUniversalTime()) { throw 'Process identity changed.' }
 $command=(Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)").CommandLine
 if($command -notmatch 'server/index\.ts|webgpu-cpu-profile-20261018[\\/]preview\.mjs') { throw 'Unexpected command.' }
 $verified+=$live
}
foreach($live in $verified) { Stop-Process -Id $live.Id }
Write-Output 'Stopped owned CPU profiling services.'
