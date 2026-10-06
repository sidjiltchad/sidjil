param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $GradleArgs
)

$candidates = @()
if ($env:JAVA_HOME) { $candidates += $env:JAVA_HOME }
$candidates += @(
  (Join-Path ${env:ProgramFiles} 'Android\Android Studio\jbr'),
  (Join-Path ${env:ProgramFiles} 'Eclipse Adoptium\jdk-21*'),
  (Join-Path ${env:ProgramFiles} 'Java\jdk-21*')
)

$jdk21 = $null
foreach ($candidate in $candidates) {
  $paths = if ($candidate -match '[*?]') {
    Get-ChildItem -Path $candidate -ErrorAction SilentlyContinue |
      Where-Object { $_.PSIsContainer } |
      ForEach-Object FullName
  } else { $candidate }
  foreach ($path in $paths) {
    $java = Join-Path $path 'bin\java.exe'
    if (-not (Test-Path -LiteralPath $java)) { continue }
    try { $version = (& $java -version 2>&1 | Out-String) } catch { continue }
    if ($version -match 'version\s+"21(?:[.\"]|$)') { $jdk21 = $path; break }
  }
  if ($jdk21) { break }
}

if (-not $jdk21) {
  throw 'Android builds require JDK 21. Install JDK 21 or Android Studio with JBR 21.'
}

$env:JAVA_HOME = $jdk21
$env:PATH = (Join-Path $jdk21 'bin') + ';' + $env:PATH
if (-not $env:GRADLE_USER_HOME) {
  $env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE '.gradle'
}
Write-Host "Using JDK 21: $jdk21"
Write-Host "Using Gradle user home: $env:GRADLE_USER_HOME"
Push-Location (Join-Path $PSScriptRoot '..\android')
try { & .\gradlew.bat @GradleArgs; exit $LASTEXITCODE }
finally { Pop-Location }
