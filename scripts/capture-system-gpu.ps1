[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [ValidateRange(1, 3600)][int]$DurationSeconds = 1200,
    [ValidateRange(1, 60)][double]$IntervalSeconds = 2,
    [ValidateRange(0, 120)][int]$WarmupSeconds = 0,
    [string]$StopFile,
    [ValidateRange(0, 3600)][int]$MaxSamples = 0
)

# External read-only telemetry. Never changes clocks, drivers, game or browser.
$ErrorActionPreference = 'Stop'
$outputPath = [IO.Path]::GetFullPath($OutputDirectory)
[void][IO.Directory]::CreateDirectory($outputPath)
$samplePath = Join-Path $outputPath 'samples.jsonl'
$runtimePath = Join-Path $outputPath 'runtime.json'
if ((Test-Path -LiteralPath $samplePath) -or (Test-Path -LiteralPath $runtimePath)) {
    throw 'Output already contains samples.jsonl or runtime.json; choose a fresh directory.'
}
if (-not $StopFile) { $StopFile = Join-Path $outputPath 'STOP' }
elseif (-not [IO.Path]::IsPathRooted($StopFile)) { $StopFile = Join-Path $outputPath $StopFile }
$stopPath = [IO.Path]::GetFullPath($StopFile)
if (-not $stopPath.StartsWith($outputPath.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'StopFile must be inside OutputDirectory.'
}
$clock = [Diagnostics.Stopwatch]::StartNew()
$logicalProcessors = [Environment]::ProcessorCount
$selfProcess = Get-Process -Id $PID
$selfIdentity = @{ pid = $PID; startUtc = $selfProcess.StartTime.ToUniversalTime().ToString('o'); path = $selfProcess.Path }
$script:children = [Collections.Generic.List[object]]::new()
$script:cleanupErrors = [Collections.Generic.List[object]]::new()
$script:previousProcesses = @{}
$script:nvidiaRows = @{}
$script:nvidiaPending = ''
$script:nvidiaReader = $null
$script:nvidiaProcess = $null
$script:nvidiaFields = @()
$script:nvidiaMissing = @()
$script:nvidiaError = $null
$script:nvidiaLastReadUtc = $null
$script:processMetadata = @{}
$script:lastMetadataAt = [double]::NegativeInfinity
$script:serializationTotalMs = 0.0
$script:serializationMaxMs = 0.0
$script:pdh = $null
$script:pdhError = $null
$jsonStream = [IO.FileStream]::new($samplePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
$writer = [IO.StreamWriter]::new($jsonStream, [Text.UTF8Encoding]::new($false))
$writer.AutoFlush = $true
$outputLimitBytes = 134217728
$rowLimit = 4096

function Utc { [DateTime]::UtcNow.ToString('o') }
function Field($object, [string]$name) {
    if ($null -eq $object) { return $null }
    $property = $object.PSObject.Properties[$name]
    if ($null -ne $property) { return $property.Value }
    return $null
}
function Numeric($value) {
    if ($null -eq $value) { return $null }
    $parsed = 0.0
    if ([double]::TryParse([string]$value, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed) -and
        -not [double]::IsNaN($parsed) -and -not [double]::IsInfinity($parsed)) { return $parsed }
    return $null
}
function ErrorFact([string]$provider, $errorRecord) {
    # No command line, invocation source, credentials or arbitrary stderr.
    return @{ provider = $provider; category = [string]$errorRecord.CategoryInfo.Category; exceptionType = $errorRecord.Exception.GetType().FullName; hresult = $errorRecord.Exception.HResult }
}
function WriteRecord($record) {
    $before = $clock.Elapsed.TotalMilliseconds
    $line = ConvertTo-Json -InputObject $record -Depth 12 -Compress
    $serializationMs = $clock.Elapsed.TotalMilliseconds - $before
    $script:serializationTotalMs += $serializationMs
    $script:serializationMaxMs = [Math]::Max($script:serializationMaxMs, $serializationMs)
    if ($jsonStream.Position + [Text.Encoding]::UTF8.GetByteCount($line) + 2 -gt $outputLimitBytes -and $record.recordType -eq 'sample') { return $false }
    $writer.WriteLine($line)
    return $true
}
function ChildIdentity($process, [string]$requestedExecutable) {
    $native = [Diagnostics.Process]::GetProcessById($process.Id)
    try {
        # Windows can return no MainModule while the new executable is loading.
        # The exact executable passed to Start-Process is known before launch;
        # cleanup must still match the observed current path AND native start.
        $observedPath = $native.MainModule.FileName
        $identityPath = if ($observedPath) { $observedPath } else { [IO.Path]::GetFullPath($requestedExecutable) }
        return @{ pid = $native.Id; startTicks = [string]$native.StartTime.ToUniversalTime().Ticks; startUtc = $native.StartTime.ToUniversalTime().ToString('o'); path = $identityPath; pathSource = if ($observedPath) { 'observed-module' } else { 'explicit-start-process-executable' } }
    }
    finally { $native.Dispose() }
}
function StopOwnedChild($entry) {
    try {
        if ($entry.process.HasExited) { return }
        $current = Get-Process -Id $entry.identity.pid -ErrorAction SilentlyContinue
        if ($null -eq $current) { return }
        $sameIdentity = ($current.StartTime.ToUniversalTime().Ticks -eq [long]$entry.identity.startTicks) -and
            [string]::Equals($current.Path, $entry.identity.path, [StringComparison]::OrdinalIgnoreCase)
        if ($sameIdentity) { Stop-Process -InputObject $current -Force; if (-not $current.WaitForExit(2000)) { throw 'Owned child did not exit.' } }
        else { [void]$script:cleanupErrors.Add(@{ provider = 'child-cleanup'; reason = 'identity-mismatch'; pid = $entry.identity.pid; expected = $entry.identity; observedStartTicks = [string]$current.StartTime.ToUniversalTime().Ticks; observedPath = $current.Path }) }
    } catch { [void]$script:cleanupErrors.Add((ErrorFact 'child-cleanup' $_)) }
}
function StartOwnedChild([string]$executable, [string[]]$arguments, [string]$label) {
    $stdout = Join-Path $outputPath ($label + '.stdout.txt')
    $stderr = Join-Path $outputPath ($label + '.stderr.txt')
    if ((Test-Path -LiteralPath $stdout) -or (Test-Path -LiteralPath $stderr)) { throw 'Auxiliary output already exists.' }
    $process = Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    try { $identity = ChildIdentity $process $executable }
    catch {
        # Retain the Process handle from this exact Start-Process, never look up
        # and kill a PID whose start/path ownership was not established.
        try { if (-not $process.HasExited) { $process.Kill(); [void]$process.WaitForExit(2000) } } catch { }
        throw
    }
    $entry = @{ process = $process; identity = $identity; stdout = $stdout; stderr = $stderr; label = $label }
    [void]$script:children.Add($entry)
    return $entry
}
function InitializeNvidia {
    $command = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
    if (-not $command) { $script:nvidiaError = @{ reason = 'executable-unavailable' }; return }
    try {
        $help = StartOwnedChild $command.Source @('--help-query-gpu') 'nvidia-help'
        if (-not $help.process.WaitForExit(3000)) { StopOwnedChild $help; throw 'NVIDIA help timed out.' }
        if ($help.process.ExitCode -ne 0) { throw 'NVIDIA help failed.' }
        $helpText = [IO.File]::ReadAllText($help.stdout)
        $definitions = @(
            @('index','index','number'), @('uuid','uuid','text'), @('name','name','text'), @('timestamp','driverTimestampRaw','text'),
            @('utilization.gpu','utilGpuPercent','number'), @('utilization.memory','utilMemoryPercent','number'),
            @('memory.used','memoryUsedMiB','number'), @('memory.total','memoryTotalMiB','number'),
            @('clocks.current.graphics','graphicsMHz','number'), @('clocks.current.memory','memoryMHz','number'),
            @('temperature.gpu','tempC','number'), @('power.draw','powerW','number'), @('pstate','pstate','text'),
            @('clocks_event_reasons.active','throttleRaw','text'), @('clocks_event_reasons.gpu_idle','gpuIdleRaw','text'),
            @('clocks_event_reasons.sw_power_cap','swPowerCapRaw','text'), @('clocks_event_reasons.sw_thermal_slowdown','swThermalRaw','text'),
            @('clocks_event_reasons.hw_thermal_slowdown','hwThermalRaw','text'), @('clocks_event_reasons.hw_power_brake_slowdown','hwPowerBrakeRaw','text')
        )
        foreach ($definition in $definitions) {
            $query = $definition[0]
            if ($helpText -notmatch ('"' + [regex]::Escape($query) + '"') -and $query.StartsWith('clocks_event_reasons.')) {
                $query = $query.Replace('clocks_event_reasons.', 'clocks_throttle_reasons.')
            }
            if ($helpText -match ('"' + [regex]::Escape($query) + '"')) {
                $script:nvidiaFields += ,@{ query = $query; name = $definition[1]; type = $definition[2] }
            } else { $script:nvidiaMissing += $definition[1] }
        }
        if ($script:nvidiaFields.Count -eq 0) { throw 'No recognized NVIDIA fields.' }
        $queryArgument = '--query-gpu=' + (($script:nvidiaFields | ForEach-Object { $_.query }) -join ',')
        $milliseconds = [int][Math]::Round($IntervalSeconds * 1000)
        $loopArgument = '--loop-ms=' + $milliseconds.ToString([Globalization.CultureInfo]::InvariantCulture)
        $script:nvidiaProcess = StartOwnedChild $command.Source @($queryArgument, '--format=csv,noheader,nounits', $loopArgument) 'nvidia'
        $script:nvidiaReader = [IO.FileStream]::new($script:nvidiaProcess.stdout, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    } catch { $script:nvidiaError = ErrorFact 'nvidia' $_ }
}
function ReadNvidia {
    $startedUtc = Utc
    $errors = [Collections.Generic.List[object]]::new()
    if ($script:nvidiaReader) {
        try {
            $buffer = [byte[]]::new(65536)
            $read = $script:nvidiaReader.Read($buffer, 0, $buffer.Length)
            if ($read -gt 0) {
                $script:nvidiaLastReadUtc = Utc
                $script:nvidiaPending += [Text.Encoding]::UTF8.GetString($buffer, 0, $read)
                $lines = $script:nvidiaPending -split "`n"
                $script:nvidiaPending = $lines[-1]
                if ($script:nvidiaPending.Length -gt 8192) { $script:nvidiaPending = ''; [void]$errors.Add(@{ reason = 'oversized-line' }) }
                for ($lineIndex = 0; $lineIndex -lt $lines.Count - 1; $lineIndex++) {
                    $line = $lines[$lineIndex].Trim()
                    if (-not $line) { continue }
                    $headers = @($script:nvidiaFields | ForEach-Object { $_.name })
                    $csv = $line | ConvertFrom-Csv -Header $headers
                    $row = @{ receivedUtc = $script:nvidiaLastReadUtc; missingFields = @($script:nvidiaMissing) }
                    foreach ($field in $script:nvidiaFields) {
                        $raw = [string](Field $csv $field.name)
                        $raw = $raw.Trim()
                        if (-not $raw -or $raw -match '^(?:\[?N/A\]?|Not Supported|Unknown Error)$') { $row[$field.name] = $null; $row.missingFields += $field.name }
                        elseif ($field.type -eq 'number') { $row[$field.name] = Numeric $raw; if ($null -eq $row[$field.name]) { $row.missingFields += $field.name } }
                        else { $row[$field.name] = $raw.Substring(0, [Math]::Min(200, $raw.Length)) }
                    }
                    $row.driverSampleUtc = $null; $row.driverUtcOffsetMinutes = $null
                    $driverDate = [DateTime]::MinValue
                    if ($row.driverTimestampRaw -and [DateTime]::TryParseExact($row.driverTimestampRaw, 'yyyy/MM/dd HH:mm:ss.fff', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$driverDate)) {
                        if (-not [TimeZoneInfo]::Local.IsAmbiguousTime($driverDate) -and -not [TimeZoneInfo]::Local.IsInvalidTime($driverDate)) {
                            $row.driverSampleUtc = [TimeZoneInfo]::ConvertTimeToUtc($driverDate, [TimeZoneInfo]::Local).ToString('o')
                            $row.driverUtcOffsetMinutes = [TimeZoneInfo]::Local.GetUtcOffset($driverDate).TotalMinutes
                        }
                    }
                    if ($null -ne $row.index) { $script:nvidiaRows[[string]$row.index] = $row }
                    else { [void]$errors.Add(@{ reason = 'unrecognized-output-line' }) }
                }
            }
        } catch { [void]$errors.Add((ErrorFact 'nvidia-read' $_)) }
    }
    $status = 'ok'
    if ($script:nvidiaError) { $status = 'unavailable'; [void]$errors.Add($script:nvidiaError) }
    elseif (-not $script:nvidiaRows.Count) { $status = 'pending' }
    if ($script:nvidiaProcess) {
        $script:nvidiaProcess.process.Refresh()
        if ($script:nvidiaProcess.process.HasExited) { $status = 'exited'; [void]$errors.Add(@{ reason = 'child-exited'; exitCode = $script:nvidiaProcess.process.ExitCode }) }
    }
    return @{ status = $status; startedUtc = $startedUtc; endedUtc = Utc; rows = @($script:nvidiaRows.Values); errors = @($errors.ToArray()); latestRowReceivedUtc = $script:nvidiaLastReadUtc; missingFields = @($script:nvidiaMissing); sampleWindow = 'NVIDIA driver window, not collector interval; rows retain receivedUtc/driverTimestampRaw and may be stale' }
}
function InstanceIdentity([string]$name) {
    $identity = @{ instance = $name.Substring(0, [Math]::Min(256, $name.Length)); pid = $null; luid = $null; physicalAdapter = $null; engine = $null; engineType = $null }
    if ($name -match '^pid_(\d+)_luid_(0x[0-9a-f]+)_(0x[0-9a-f]+)_phys_(\d+)(?:_eng_(\d+)_engtype_(.+))?$') {
        $identity.pid = [int]$Matches[1]; $identity.luid = $Matches[2] + '_' + $Matches[3]; $identity.physicalAdapter = [int]$Matches[4]
        if ($Matches[5]) { $identity.engine = [int]$Matches[5]; $identity.engineType = $Matches[6] }
    } elseif ($name -match '^luid_(0x[0-9a-f]+)_(0x[0-9a-f]+)_phys_(\d+)$') {
        $identity.luid = $Matches[1] + '_' + $Matches[2]; $identity.physicalAdapter = [int]$Matches[3]
    }
    return $identity
}
function InitializePdh {
    try {
        Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
public sealed class StrahovExternalPdh : IDisposable {
 [DllImport("pdh.dll",CharSet=CharSet.Unicode)] static extern uint PdhOpenQueryW(string source,UIntPtr data,out IntPtr query);
 [DllImport("pdh.dll",CharSet=CharSet.Unicode)] static extern uint PdhAddEnglishCounterW(IntPtr query,string path,UIntPtr data,out IntPtr counter);
 [DllImport("pdh.dll")] static extern uint PdhCollectQueryData(IntPtr query);
 [DllImport("pdh.dll",CharSet=CharSet.Unicode)] static extern uint PdhGetFormattedCounterArrayW(IntPtr counter,uint format,ref uint size,out uint count,IntPtr items);
 [DllImport("pdh.dll")] static extern uint PdhCloseQuery(IntPtr query);
 [StructLayout(LayoutKind.Explicit,Size=16)] struct Value { [FieldOffset(0)] public uint status; [FieldOffset(8)] public double number; }
 [StructLayout(LayoutKind.Sequential)] struct Item { public IntPtr name; public Value value; }
 sealed class Counter { public string group,field,path; public IntPtr handle; public uint status; }
 IntPtr query; readonly List<Counter> counters=new List<Counter>(); readonly Stopwatch clock=Stopwatch.StartNew(); double lastMs;
 const uint MoreData=0x800007D2,DoubleFormat=0x200|0x8000; const int Limit=4096,MaxBuffer=16777216;
 static readonly Regex Instance=new Regex(@"^(?:pid_(?<pid>\d+)_)?luid_(?<hi>0x[0-9a-f]+)_(?<lo>0x[0-9a-f]+)_phys_(?<phys>\d+)(?:_eng_(?<eng>\d+)_engtype_(?<type>.+))?$",RegexOptions.IgnoreCase|RegexOptions.Compiled);
 static Dictionary<string,object> Obj(){return new Dictionary<string,object>();}
 void Add(string group,string field,string path){var c=new Counter{group=group,field=field,path=path};c.status=PdhAddEnglishCounterW(query,path,UIntPtr.Zero,out c.handle);counters.Add(c);}
 public StrahovExternalPdh(){uint result=PdhOpenQueryW(null,UIntPtr.Zero,out query);if(result!=0)throw new InvalidOperationException("PdhOpenQuery:"+result.ToString("X8"));
  try{
   Add("gpuEngine","utilizationPercent",@"\GPU Engine(*)\Utilization Percentage");
   Add("gpuProcessMemory","dedicatedBytes",@"\GPU Process Memory(*)\Dedicated Usage");Add("gpuProcessMemory","sharedBytes",@"\GPU Process Memory(*)\Shared Usage");Add("gpuProcessMemory","committedBytes",@"\GPU Process Memory(*)\Total Committed");
   Add("gpuProcessMemory","localBytes",@"\GPU Process Memory(*)\Local Usage");Add("gpuProcessMemory","nonLocalBytes",@"\GPU Process Memory(*)\Non Local Usage");
   Add("gpuAdapterMemory","dedicatedBytes",@"\GPU Adapter Memory(*)\Dedicated Usage");Add("gpuAdapterMemory","sharedBytes",@"\GPU Adapter Memory(*)\Shared Usage");Add("gpuAdapterMemory","committedBytes",@"\GPU Adapter Memory(*)\Total Committed");
   Add("systemCpu","cpuPercent",@"\Processor(*)\% Processor Time");Add("systemCpu","dpcPercent",@"\Processor(*)\% DPC Time");Add("systemCpu","interruptPercent",@"\Processor(*)\% Interrupt Time");
  }catch{Dispose();throw;}
 }
 public uint Warm(){lastMs=clock.Elapsed.TotalMilliseconds;return PdhCollectQueryData(query);}
 static Dictionary<string,object> Row(string name){var r=Obj();r["instance"]=name.Length>256?name.Substring(0,256):name;r["pid"]=null;r["luid"]=null;r["physicalAdapter"]=null;r["engine"]=null;r["engineType"]=null;r["counterStatus"]=new Dictionary<string,uint>();
  Match m=Instance.Match(name);int n;if(m.Success){if(Int32.TryParse(m.Groups["pid"].Value,out n))r["pid"]=n;r["luid"]=m.Groups["hi"].Value+"_"+m.Groups["lo"].Value;if(Int32.TryParse(m.Groups["phys"].Value,out n))r["physicalAdapter"]=n;if(Int32.TryParse(m.Groups["eng"].Value,out n))r["engine"]=n;if(m.Groups["type"].Success)r["engineType"]=m.Groups["type"].Value;}return r;
 }
 public Dictionary<string,object> Sample(){string started=DateTime.UtcNow.ToString("o");double now=clock.Elapsed.TotalMilliseconds,period=now-lastMs;uint collect=PdhCollectQueryData(query);lastMs=now;
  var rows=new Dictionary<string,Dictionary<string,Dictionary<string,object>>>();var errors=new Dictionary<string,List<object>>();var omitted=new Dictionary<string,int>();var filtered=new Dictionary<string,int>();
  foreach(string group in new[]{"gpuEngine","gpuProcessMemory","gpuAdapterMemory","systemCpu"}){rows[group]=new Dictionary<string,Dictionary<string,object>>();errors[group]=new List<object>();omitted[group]=0;filtered[group]=0;}
  foreach(Counter c in counters){uint status=c.status,size=0,count=0;IntPtr buffer=IntPtr.Zero;try{
   if(status==0&&collect!=0)status=collect;
   if(status==0){for(int attempt=0;attempt<3;attempt++){size=0;count=0;status=PdhGetFormattedCounterArrayW(c.handle,DoubleFormat,ref size,out count,IntPtr.Zero);if(status==0&&size==0)break;if(status!=MoreData)break;if(size==0||size>MaxBuffer){status=0xC0000BBC;break;}buffer=Marshal.AllocHGlobal((int)size);status=PdhGetFormattedCounterArrayW(c.handle,DoubleFormat,ref size,out count,buffer);if(status!=MoreData)break;Marshal.FreeHGlobal(buffer);buffer=IntPtr.Zero;}}
   if(status!=0){errors[c.group].Add(new{field=c.field,path=c.path,status=status,statusHex=status.ToString("X8")});continue;}
   int stride=Marshal.SizeOf(typeof(Item));if((ulong)count*(ulong)stride>size){errors[c.group].Add(new{field=c.field,reason="invalid-array-size"});continue;}for(uint i=0;i<count;i++){Item item=(Item)Marshal.PtrToStructure(IntPtr.Add(buffer,checked((int)i*stride)),typeof(Item));string name=Marshal.PtrToStringUni(item.name)??"";if(c.group=="systemCpu"&&name!="_Total")continue;bool valid=(item.value.status==0||item.value.status==1)&&!Double.IsNaN(item.value.number)&&!Double.IsInfinity(item.value.number);
    if(c.group=="gpuEngine"&&valid&&item.value.number<=0){filtered[c.group]++;continue;}
    Dictionary<string,object> row;if(!rows[c.group].TryGetValue(name,out row)){if(rows[c.group].Count>=Limit){omitted[c.group]++;continue;}row=Row(name);rows[c.group][name]=row;}
    row[c.field]=valid?(object)item.value.number:null;((Dictionary<string,uint>)row["counterStatus"])[c.field]=item.value.status;
   }
  }finally{if(buffer!=IntPtr.Zero)Marshal.FreeHGlobal(buffer);}}
  var output=Obj();foreach(string group in rows.Keys){var fields=new List<string>();foreach(Counter c in counters)if(c.group==group)fields.Add(c.field);foreach(var row in rows[group].Values){var missing=new List<string>();foreach(string field in fields){if(!row.ContainsKey(field)){row[field]=null;missing.Add(field);}else if(row[field]==null)missing.Add(field);}row["missingFields"]=missing.ToArray();}
   var p=Obj();p["status"]=errors[group].Count==0?"ok":rows[group].Count==0?"unavailable":"partial";p["startedUtc"]=started;p["endedUtc"]=DateTime.UtcNow.ToString("o");p["rows"]=new List<Dictionary<string,object>>(rows[group].Values).ToArray();p["errors"]=errors[group].ToArray();p["error"]=errors[group].Count==0?null:errors[group][0];p["omitted"]=omitted[group];p["zeroInstancesFiltered"]=filtered[group];p["activeOnly"]=group=="gpuEngine";p["provider"]= "native PDH AddEnglishCounter/GetFormattedCounterArray";p["providerIntervalMs"]=period;p["sampleWindow"]="Persistent PDH counter deltas; invalid/new-instance CStatus is null, zero GPU-engine instances filtered; absence is not fabricated zero";output[group]=p;
  }output["queryMs"]=clock.Elapsed.TotalMilliseconds-now;return output;
 }
 public void Dispose(){if(query!=IntPtr.Zero){PdhCloseQuery(query);query=IntPtr.Zero;}}
}
'@
        $script:pdh = [StrahovExternalPdh]::new()
        [void]$script:pdh.Warm()
    } catch { $script:pdhError = ErrorFact 'pdh-init' $_ }
}
function MissingPdh([string]$group) {
    return @{ status = 'unavailable'; startedUtc = Utc; endedUtc = Utc; rows = @(); error = $script:pdhError; omitted = 0; provider = 'native PDH'; group = $group }
}
function BrowserRole($processInfo) {
    if ($processInfo.Name -notmatch '^(?:msedge|chrome|chromium|brave|vivaldi|opera|codex|code)\.exe$') { return $null }
    $commandLine = Field $processInfo 'CommandLine'
    if (-not $commandLine) { return 'unknown' }
    if ($commandLine -match '(?:^|\s)--type=(?:"?)([a-z-]+)') {
        if ($Matches[1] -in @('renderer','gpu-process','utility','crashpad-handler','zygote')) { return $Matches[1] }
        return 'other-browser-subprocess'
    }
    return 'browser'
}
function ReadProcesses($gpuEngine, $gpuMemory) {
    $startedUtc = Utc
    try {
        $needed = @{}
        foreach ($row in @($gpuEngine.rows) + @($gpuMemory.rows)) { if ($null -ne $row.pid) { $needed[[string]$row.pid] = $true } }
        $needed[[string]$PID] = $true
        $atMs = $clock.Elapsed.TotalMilliseconds
        $metadataError = $null
        if ($atMs - $script:lastMetadataAt -ge 5000) {
            try {
                $metadata = @{}
                foreach ($info in Get-CimInstance -ClassName Win32_Process -Property ProcessId,CreationDate,Name,CommandLine -OperationTimeoutSec 2) {
                    if ($info.Name -match '^(?:msedge|chrome|chromium|brave|vivaldi|opera|codex|code)\.exe$') {
                        $metadata[[string]$info.ProcessId] = @{ start = $info.CreationDate; role = BrowserRole $info }
                    }
                }
                $script:processMetadata = $metadata
            } catch { $metadataError = ErrorFact 'process-role-metadata' $_ }
            $script:lastMetadataAt = $atMs
        }
        $raw = @(Get-Process)
        $rows = [Collections.Generic.List[object]]::new(); $next = @{}
        foreach ($item in $raw) {
            $processId = [int]$item.Id
            $browser = $item.ProcessName -match '^(?:msedge|chrome|chromium|brave|vivaldi|opera|codex|code)$'
            if (-not $needed.ContainsKey([string]$processId) -and -not $browser -and $item.ProcessName -notmatch '^(?:nvidia-smi|WmiPrvSE|node|pwsh|powershell|blender)$') { $item.Dispose(); continue }
            $startUtc = $null; $userRaw = $null; $kernelRaw = $null; $role = $null; $status = 'ok'
            try {
                $start = $item.StartTime.ToUniversalTime(); $startUtc = $start.ToString('o')
                $userRaw = $item.UserProcessorTime.Ticks; $kernelRaw = $item.PrivilegedProcessorTime.Ticks
                if ($browser) {
                    $known = $script:processMetadata[[string]$processId]
                    # WMI datetime has microsecond precision; native start ticks
                    # can have100ns precision. Never join just by PID/name.
                    $role = if ($known -and $known.start -and [Math]::Abs(($start - $known.start.ToUniversalTime()).TotalMilliseconds) -le 1) { $known.role } else { 'unknown' }
                }
            } catch { $status = 'inaccessible-or-exited' }
            $row = @{ pid = $processId; startUtc = $startUtc; name = ([string]$item.ProcessName).Substring(0,[Math]::Min(128,([string]$item.ProcessName).Length)); browserRole = $role; roleMetadataAgeMs = $atMs - $script:lastMetadataAt; user100ns = if ($null -ne $userRaw) { [string]$userRaw } else { $null }; kernel100ns = if ($null -ne $kernelRaw) { [string]$kernelRaw } else { $null }; cpuUserOneCorePercent = $null; cpuKernelOneCorePercent = $null; cpuSystemNormalizedPercent = $null; intervalMs = $null; identityKnown = ($null -ne $startUtc); status = $status }
            if ($startUtc -and $null -ne $userRaw -and $null -ne $kernelRaw) {
                $identityKey = [string]$processId + '|' + $startUtc
                $old = $script:previousProcesses[$identityKey]
                if ($old -and $atMs -gt $old.atMs) {
                    $deltaUser = [decimal]$userRaw - $old.user; $deltaKernel = [decimal]$kernelRaw - $old.kernel
                    if ($deltaUser -ge 0 -and $deltaKernel -ge 0) {
                        $periodMs = $atMs - $old.atMs
                        $row.intervalMs = $periodMs
                        $row.cpuUserOneCorePercent = [double]$deltaUser / ($periodMs * 100)
                        $row.cpuKernelOneCorePercent = [double]$deltaKernel / ($periodMs * 100)
                        $row.cpuSystemNormalizedPercent = ($row.cpuUserOneCorePercent + $row.cpuKernelOneCorePercent) / $logicalProcessors
                    }
                }
                $next[$identityKey] = @{ atMs = $atMs; user = [decimal]$userRaw; kernel = [decimal]$kernelRaw }
            }
            [void]$rows.Add($row); [void]$needed.Remove([string]$processId); $item.Dispose()
        }
        foreach ($missingId in $needed.Keys) { [void]$rows.Add(@{ pid = [int]$missingId; startUtc = $null; name = $null; browserRole = $null; identityKnown = $false; status = 'not-observed'; cpuUserOneCorePercent = $null; cpuKernelOneCorePercent = $null; cpuSystemNormalizedPercent = $null; intervalMs = $null }) }
        $script:previousProcesses = $next
        return @{ status = 'ok'; startedUtc = $startedUtc; endedUtc = Utc; rows = @($rows.ToArray()); error = $metadataError; scope = 'GetProcess cumulative user/kernel for GPU-memory/active-engine PIDs, browsers, collector/NVIDIA/WMI/node/shell/Blender; roles WMI refreshed every5s; no full command lines retained; not a global top-CPU process ranking' }
    } catch { return @{ status = 'unavailable'; startedUtc = $startedUtc; endedUtc = Utc; rows = @(); error = ErrorFact 'processes' $_ } }
}

$reason = 'duration'
$samples = 0
$steadySamples = 0
$lastSampleAt = $null
$lastCpuMs = $null
$lastCpuAt = $null
$startedUtc = Utc
try {
    InitializePdh
    InitializeNvidia
    $metadata = @{ schemaVersion = 1; recordType = 'metadata'; utc = Utc; requestedDurationSeconds = $DurationSeconds; requestedIntervalSeconds = $IntervalSeconds; warmupSeconds = $WarmupSeconds; maxSamples = $MaxSamples; maxSamplesScope = 'steady samples; warmup rows preserved and duration bounds both'; logicalProcessors = $logicalProcessors; collector = $selfIdentity; stopFile = $stopPath; localTimeZoneId = [TimeZoneInfo]::Local.Id; localUtcOffsetMinutes = [TimeZoneInfo]::Local.GetUtcOffset([DateTime]::UtcNow).TotalMinutes; units = @{ memoryWindows = 'bytes'; memoryNvidia = 'MiB'; cpuRaw = '100ns strings'; cpuOneCore = '100%=one logical core; may exceed100'; cpuSystemNormalized = 'oneCorePercent/logicalProcessors'; gpuUtilization = 'raw active-only per-engine percentage; zero instances filtered, absent row is not observed zero; do not sum engines'; processMemory = 'per PID/adapter raw; do not sum into whole VRAM' }; providers = @{ windows = 'Persistent native PDH AddEnglishCounter wildcard arrays, CStatus valid0/new1, missing null'; systemCpu = 'native PDH Processor wildcard filtered to _Total'; processCpu = 'GetProcess user/kernel TimeSpan ticks deltas keyed PID+nativeStartTime, browser roles WMI metadata at most every5s'; nvidia = 'single hidden NVIDIA-SMI stream; driverSampleUtc conversion uses localTZ only when nonambiguous; driver window differs from collector/read time' }; nvidiaFields = @($script:nvidiaFields); nvidiaMissingFields = @($script:nvidiaMissing); outputLimitBytes = $outputLimitBytes }
    [void](WriteRecord $metadata)
    $runtime = @{ schemaVersion = 1; status = 'running'; startedUtc = $startedUtc; collector = $selfIdentity; outputDirectory = $outputPath; sampleFile = $samplePath; stopFile = $stopPath; helpers = @($script:children | ForEach-Object { $_.identity }) }
    [IO.File]::WriteAllText($runtimePath, (ConvertTo-Json $runtime -Depth 6), [Text.UTF8Encoding]::new($false))
    $captureStarted = $clock.Elapsed.TotalMilliseconds
    $nextAt = $captureStarted + $IntervalSeconds * 1000
    while ($clock.Elapsed.TotalMilliseconds - $captureStarted -lt $DurationSeconds * 1000) {
        if (Test-Path -LiteralPath $stopPath) { $reason = 'stop-file'; break }
        if ($MaxSamples -gt 0 -and $steadySamples -ge $MaxSamples) { $reason = 'max-samples'; break }
        $waitMs = $nextAt - $clock.Elapsed.TotalMilliseconds
        if ($waitMs -gt 0) { Start-Sleep -Milliseconds ([int][Math]::Ceiling([Math]::Min($waitMs, 250))); continue }
        $at = $clock.Elapsed.TotalMilliseconds; $utc = Utc
        $native = if ($script:pdh) { $script:pdh.Sample() } else { $null }
        $engineRows = if ($native) { $native['gpuEngine'] } else { MissingPdh 'gpuEngine' }
        $memoryRows = if ($native) { $native['gpuProcessMemory'] } else { MissingPdh 'gpuProcessMemory' }
        $adapterRows = if ($native) { $native['gpuAdapterMemory'] } else { MissingPdh 'gpuAdapterMemory' }
        $systemCpu = if ($native) { $native['systemCpu'] } else { MissingPdh 'systemCpu' }
        $processRows = ReadProcesses $engineRows $memoryRows
        $nvidia = ReadNvidia
        $selfProcess.Refresh(); $cpuMs = $selfProcess.TotalProcessorTime.TotalMilliseconds
        $cpuAt = $clock.Elapsed.TotalMilliseconds
        $logger = @{ cpuMs = $cpuMs; intervalCpuMs = $null; oneCorePercent = $null; workingSetBytes = $selfProcess.WorkingSet64; scope = 'collector process only; helper/provider CPU visible separately in process rows' }
        if ($null -ne $lastCpuMs -and $cpuAt -gt $lastCpuAt) { $logger.intervalCpuMs = $cpuMs - $lastCpuMs; $logger.oneCorePercent = ($cpuMs - $lastCpuMs) * 100 / ($cpuAt - $lastCpuAt) }
        $phase = if ($WarmupSeconds -gt 0 -and ($null -eq $lastCpuAt -or $lastCpuAt - $captureStarted -lt $WarmupSeconds * 1000)) { 'warmup' } else { 'steady' }
        $sample = @{ schemaVersion = 1; recordType = 'sample'; phase = $phase; seq = $samples; utc = $utc; endedUtc = Utc; elapsedMs = $at - $captureStarted; periodMs = if ($null -ne $lastSampleAt) { $at - $lastSampleAt } else { $null }; collectionMs = $clock.Elapsed.TotalMilliseconds - $at; intervalOverrun = ($clock.Elapsed.TotalMilliseconds - $at -gt $IntervalSeconds * 1000); providers = @{ gpuEngine = $engineRows; gpuProcessMemory = $memoryRows; gpuAdapterMemory = $adapterRows; systemCpu = $systemCpu; nvidia = $nvidia; processes = $processRows }; processes = @($processRows.rows); logger = $logger; errors = @() }
        if (-not (WriteRecord $sample)) { $reason = 'output-limit'; break }
        $samples++; $lastSampleAt = $at; $lastCpuMs = $cpuMs; $lastCpuAt = $cpuAt
        if ($phase -eq 'steady') { $steadySamples++ }
        # Avoid a burst of catch-up queries when a provider was slow.
        $nextAt = [Math]::Max($nextAt + $IntervalSeconds * 1000, $clock.Elapsed.TotalMilliseconds)
    }
} catch {
    $reason = 'error'
    try { [void](WriteRecord @{ schemaVersion = 1; recordType = 'error'; utc = Utc; error = ErrorFact 'collector' $_ }) } catch { }
} finally {
    if ($script:pdh) { $script:pdh.Dispose() }
    if ($script:nvidiaReader) { $script:nvidiaReader.Dispose() }
    foreach ($child in $script:children) { StopOwnedChild $child }
    $selfProcess.Refresh()
    try {
        [void](WriteRecord @{ schemaVersion = 1; recordType = 'summary'; utc = Utc; reason = $reason; samples = $samples; steadySamples = $steadySamples; warmupSamples = $samples - $steadySamples; elapsedMs = $clock.Elapsed.TotalMilliseconds; collectorCpuMs = $selfProcess.TotalProcessorTime.TotalMilliseconds; serializationTotalMs = $script:serializationTotalMs; serializationMaxMs = $script:serializationMaxMs; cleanupErrors = @($script:cleanupErrors.ToArray()) })
        $runtime = @{ schemaVersion = 1; status = if ($script:cleanupErrors.Count -eq 0) { 'stopped' } else { 'cleanup-failed' }; reason = $reason; startedUtc = $startedUtc; endedUtc = Utc; collector = $selfIdentity; helpers = @($script:children | ForEach-Object { $_.identity }); outputDirectory = $outputPath; sampleFile = $samplePath; stopFile = $stopPath; samples = $samples; cleanupErrors = @($script:cleanupErrors.ToArray()) }
        [IO.File]::WriteAllText($runtimePath, (ConvertTo-Json $runtime -Depth 6), [Text.UTF8Encoding]::new($false))
    } finally { $writer.Dispose(); $jsonStream.Dispose(); $selfProcess.Dispose() }
}
if ($reason -eq 'error' -or $script:cleanupErrors.Count -gt 0) { exit 1 }
