param([Parameter(Mandatory=$true)][ValidateSet('r1','v1','w1','w2','w3','w4','w5','w6','w7')][string]$RunId)
$ErrorActionPreference='Stop'
$runtime=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot ('runs-f3-replica/'+$RunId+'/runtime.json')) | ConvertFrom-Json
if($runtime.task -ne 'webgpu-serializer-schema-qa-20261019' -or $runtime.run -ne $RunId -or $runtime.url -ne 'http://127.0.0.1:4200/') { throw 'Not this task runtime.' }
if($runtime.source -notin @('reference','candidate-v3')) { throw 'Unexpected source.' }
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
