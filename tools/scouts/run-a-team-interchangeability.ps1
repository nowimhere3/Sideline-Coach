$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $repoRoot

$secureKey = Read-Host 'Google Gemini API key (kept only in this PowerShell process)' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    $env:GEMINI_API_KEY = $plainKey
    $env:GOOGLE_GENERATIVE_AI_API_KEY = $plainKey
    $env:OPENCODE_DB = Join-Path $env:USERPROFILE '.local\share\opencode\scout-interchangeability.db'
    npm run scout:interchangeability -- --manifest 'tools\scouts\a-team-interchangeability-play.json'
    $commandExitCode = $LASTEXITCODE
}
finally {
    Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:GOOGLE_GENERATIVE_AI_API_KEY -ErrorAction SilentlyContinue
    $plainKey = $null
    if ($keyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
}

if ($commandExitCode -ne 0) {
    throw "Interchangeability proof completed with exit code $commandExitCode. Inspect preserved Play evidence."
}
