param([Parameter(Mandatory=$true)][ValidateSet('a1','m1','a2','a3','m2','a4','m3')][string]$RunId)
$ErrorActionPreference='Stop'
$runtime=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ('runs/'+$RunId+'/runtime.json')) | ConvertFrom-Json
if($runtime.task -ne 'webgpu-serializer-schema-qa-20261019' -or $runtime.run -ne $RunId -or $runtime.url -ne 'http://127.0.0.1:4200/') { throw 'Not this task runtime.' }
if($runtime.source -notin @('reference','candidate-v1')) { throw 'Unexpected source.' }
if([IO.Path]::GetFullPath($runtime.cwd) -ne [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $runtime.source))) { throw 'Checkpoint identity mismatch.' }
$verified=@()
foreach($record in $runtime.processes) {
 $live=Get-Process -Id $record.pid -ErrorAction SilentlyContinue
 if(-not $live) { continue }
 if($live.Path -ne $record.path -or $live.StartTime.ToUniversalTime() -ne ([datetime]$record.startUTC).ToUniversalTime()) { throw 'Process identity changed.' }
 $command=(Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)").CommandLine
 if($command -notmatch 'server/index\.ts|webgpu-serializer-schema-qa-20261019[\\/]preview\.mjs') { throw 'Unexpected command.' }
 $verified+=$live
}
foreach($live in $verified) { Stop-Process -Id $live.Id }
Write-Output "Stopped owned memo pilot services $RunId."
