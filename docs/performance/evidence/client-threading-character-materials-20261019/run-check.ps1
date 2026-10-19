param(
 [Parameter(Mandatory=$true)][ValidateSet('clean','combined')][string]$Kind,
 [Parameter(Mandatory=$true)][ValidateSet('test','build','integration')][string]$Stage
)
$ErrorActionPreference='Stop'
$manifest=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'validation-manifest.json') | ConvertFrom-Json
$snapshot=$manifest.snapshots.$Kind
$sourceRoot=$snapshot.path
$log=Join-Path $PSScriptRoot "logs/$Kind-$Stage.log"
if (Test-Path -LiteralPath $log) { throw "Preserve existing check: $log" }
if ($Stage -eq 'integration' -and (Get-NetTCPConnection -LocalPort 2568 -State Listen -ErrorAction SilentlyContinue)) { throw 'Reserved integration port2568 already occupied; do not use another server.' }
$env:GIT_CEILING_DIRECTORIES=$PSScriptRoot
$env:TMP=Join-Path $PSScriptRoot 'tmp'
$env:TEMP=$env:TMP
$env:TSX_DISABLE_CACHE='1'
$env:HOST='127.0.0.1'
$env:VITE_SOURCE_SNAPSHOT_ID=$snapshot.source
$env:STRAHOV_SOURCE_SNAPSHOT_ID=$snapshot.source
$started=(Get-Date).ToUniversalTime().ToString('o')
Push-Location -LiteralPath $sourceRoot
try {
 switch ($Stage) {
  'test' { pnpm exec tsx --test --test-concurrency=4 tests/*.test.ts *> $log }
  'build' { pnpm build *> $log }
  'integration' { pnpm test:integration *> $log }
 }
 $code=$LASTEXITCODE
} finally { Pop-Location }
$result=@{kind=$Kind;stage=$Stage;source=$snapshot.source;startedUTC=$started;endedUTC=(Get-Date).ToUniversalTime().ToString('o');exitCode=$code;log=$log;testConcurrency=if($Stage -eq 'test'){4}else{$null}}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot "logs/$Kind-$Stage.result.json")
Get-Content -LiteralPath $log -Tail 18
exit $code
