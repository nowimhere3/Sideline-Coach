**********************
Windows PowerShell transcript start
Start time: 20260914212612
Username: WORK-BEAST\dmcal
RunAs User: WORK-BEAST\dmcal
Configuration Name: 
Machine: WORK-BEAST (Microsoft Windows NT 10.0.26200.0)
Host Application: C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -noexit -command try { . "c:\Users\dmcal\AppData\Local\Programs\Microsoft VS Code\645f29cc31\resources\app\out\vs\workbench\contrib\terminal\common\scripts\shellIntegration.ps1" } catch {}
Process ID: 37768
PSVersion: 5.1.26100.9444
PSEdition: Desktop
PSCompatibleVersions: 1.0, 2.0, 3.0, 4.0, 5.0, 5.1.26100.9444
BuildVersion: 10.0.26100.9444
CLRVersion: 4.0.30319.42000
WSManStackVersion: 3.0
PSRemotingProtocolVersion: 2.3
SerializationVersion: 1.1.0.1
**********************
Transcript started, output file is C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\SidelineCoach-Terminal-Session.txt
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>Write-Host "`n=== SIDELINE COACH MULTI-GAME RUNTIME SNAPSHOT ===" -ForegroundColor Cyan; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Code.exe' -and $_.CommandLine -and ($_.CommandLine -like '*SidelineCoach*' -or $_.CommandLine -like '*Trend and Tap Assist*') } | Select-Object ProcessId,ParentProcessId,@{N='CommandLine';E={$_.CommandLine}} | Format-List

=== SIDELINE COACH MULTI-GAME RUNTIME SNAPSHOT ===


ProcessId       : 28736
ParentProcessId : 5248
CommandLine     : "C:\Users\dmcal\AppData\Local\Programs\Microsoft VS
                  Code\Code.exe" --user-data-dir=C:\Users\dmcal\.sideline
                  \dev-hosts\gs3\user-data --extensions-dir=C:\Users\dmca
                  l\.sideline\dev-hosts\gs3\extensions
                  --disable-workspace-trust --extensionDevelopmentPath=C:
                  \Users\dmcal\Documents\GitHub\SidelineCoach
                  --inspect-extensions=9229
                  C:\Users\dmcal\Documents\GitHub\GS3

ProcessId       : 30684
ParentProcessId : 27060
CommandLine     : "C:\Users\dmcal\AppData\Local\Programs\Microsoft VS
                  Code\Code.exe" c:\Users\dmcal\Documents\GitHub\Sideline
                  Coach\out\control-plane\daemon.js

ProcessId       : 2280
ParentProcessId : 16380
CommandLine     : "C:\Users\dmcal\AppData\Local\Programs\Microsoft VS
                  Code\Code.exe" --user-data-dir=C:\Users\dmcal\.sideline
                  \dev-hosts\gametest\user-data --extensions-dir=C:\Users
                  \dmcal\.sideline\dev-hosts\gametest\extensions
                  --disable-workspace-trust --extensionDevelopmentPath=C:
                  \Users\dmcal\Documents\GitHub\SidelineCoach
                  --inspect-extensions=9231
                  C:\Users\dmcal\Documents\GitHub\SidelineCoach-GameTest



]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>Write-Host "`n=== SIDELINE COACH MULTI-GAME RUNTIME SNAPSHOT ===" -ForegroundColor Cyan; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Code.exe' -and $_.CommandLine -and ($_.CommandLine -like '*SidelineCoach*' -or $_.CommandLine -like '*Trend and Tap Assist*') } | Select-Object ProcessId,ParentProcessId,@{N='CommandLine';E={$_.CommandLine}} | Format-List

=== SIDELINE COACH MULTI-GAME RUNTIME SNAPSHOT ===


ProcessId       : 28736
ParentProcessId : 5248
CommandLine     : "C:\Users\dmcal\AppData\Local\Programs\Microsoft VS
                  Code\Code.exe" --user-data-dir=C:\Users\dmcal\.sideline
                  \dev-hosts\gs3\user-data --extensions-dir=C:\Users\dmca
                  l\.sideline\dev-hosts\gs3\extensions
                  --disable-workspace-trust --extensionDevelopmentPath=C:
                  \Users\dmcal\Documents\GitHub\SidelineCoach
                  --inspect-extensions=9229
                  C:\Users\dmcal\Documents\GitHub\GS3

ProcessId       : 30684
ParentProcessId : 27060
CommandLine     : "C:\Users\dmcal\AppData\Local\Programs\Microsoft VS
                  Code\Code.exe" c:\Users\dmcal\Documents\GitHub\Sideline
                  Coach\out\control-plane\daemon.js

ProcessId       : 2280
ParentProcessId : 16380
CommandLine     : "C:\Users\dmcal\AppData\Local\Programs\Microsoft VS
                  Code\Code.exe" --user-data-dir=C:\Users\dmcal\.sideline
                  \dev-hosts\gametest\user-data --extensions-dir=C:\Users
                  \dmcal\.sideline\dev-hosts\gametest\extensions
                  --disable-workspace-trust --extensionDevelopmentPath=C:
                  \Users\dmcal\Documents\GitHub\SidelineCoach
                  --inspect-extensions=9231
                  C:\Users\dmcal\Documents\GitHub\SidelineCoach-GameTest



]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>Write-Host "`n=== SIDELINE COACH MULTI-GAME RUNTIME SNAPSHOT ===" -ForegroundColor Cyan; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Code.exe' -and $_.CommandLine -and ($_.CommandLine -like '*SidelineCoach*' -or $_.CommandLine -like '*Trend and Tap Assist*') } | Select-Object ProcessId,ParentProcessId,@{N='CommandLine';E={$_.CommandLine}} | Format-List

=== SIDELINE COACH MULTI-GAME RUNTIME SNAPSHOT ===


ProcessId       : 28736
ParentProcessId : 5248
CommandLine     : "C:\Users\dmcal\AppData\Local\Programs\Microsoft VS
                  Code\Code.exe" --user-data-dir=C:\Users\dmcal\.sideline
                  \dev-hosts\gs3\user-data --extensions-dir=C:\Users\dmca
                  l\.sideline\dev-hosts\gs3\extensions
                  --disable-workspace-trust --extensionDevelopmentPath=C:
                  \Users\dmcal\Documents\GitHub\SidelineCoach
                  --inspect-extensions=9229
                  C:\Users\dmcal\Documents\GitHub\GS3

ProcessId       : 30684
ParentProcessId : 27060
CommandLine     : "C:\Users\dmcal\AppData\Local\Programs\Microsoft VS
                  Code\Code.exe" c:\Users\dmcal\Documents\GitHub\Sideline
                  Coach\out\control-plane\daemon.js

ProcessId       : 2280
ParentProcessId : 16380
CommandLine     : "C:\Users\dmcal\AppData\Local\Programs\Microsoft VS
                  Code\Code.exe" --user-data-dir=C:\Users\dmcal\.sideline
                  \dev-hosts\gametest\user-data --extensions-dir=C:\Users
                  \dmcal\.sideline\dev-hosts\gametest\extensions
                  --disable-workspace-trust --extensionDevelopmentPath=C:
                  \Users\dmcal\Documents\GitHub\SidelineCoach
                  --inspect-extensions=9231
                  C:\Users\dmcal\Documents\GitHub\SidelineCoach-GameTest



]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>Write-Host "`n=== SIDELINE COACH MULTI-GAME RUNTIME SNAPSHOT ===" -ForegroundColor Cyan; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Code.exe' -and $_.CommandLine -and ($_.CommandLine -like '*SidelineCoach*' -or $_.CommandLine -like '*Trend and Tap Assist*') } | Select-Object ProcessId,ParentProcessId,@{N='CommandLine';E={$_.CommandLine}} | Format-List

=== SIDELINE COACH MULTI-GAME RUNTIME SNAPSHOT ===


ProcessId       : 28736
ParentProcessId : 5248
CommandLine     : "C:\Users\dmcal\AppData\Local\Programs\Microsoft VS
                  Code\Code.exe" --user-data-dir=C:\Users\dmcal\.sideline
                  \dev-hosts\gs3\user-data --extensions-dir=C:\Users\dmca
                  l\.sideline\dev-hosts\gs3\extensions
                  --disable-workspace-trust --extensionDevelopmentPath=C:
                  \Users\dmcal\Documents\GitHub\SidelineCoach
                  --inspect-extensions=9229
                  C:\Users\dmcal\Documents\GitHub\GS3

ProcessId       : 30684
ParentProcessId : 27060
CommandLine     : "C:\Users\dmcal\AppData\Local\Programs\Microsoft VS
                  Code\Code.exe" c:\Users\dmcal\Documents\GitHub\Sideline
                  Coach\out\control-plane\daemon.js

ProcessId       : 2280
ParentProcessId : 16380
CommandLine     : "C:\Users\dmcal\AppData\Local\Programs\Microsoft VS
                  Code\Code.exe" --user-data-dir=C:\Users\dmcal\.sideline
                  \dev-hosts\gametest\user-data --extensions-dir=C:\Users
                  \dmcal\.sideline\dev-hosts\gametest\extensions
                  --disable-workspace-trust --extensionDevelopmentPath=C:
                  \Users\dmcal\Documents\GitHub\SidelineCoach
                  --inspect-extensions=9231
                  C:\Users\dmcal\Documents\GitHub\SidelineCoach-GameTest



]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>cd "C:\Users\dmcal\Documents\GitHub\SidelineCoach"
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>npm run dev:verify

]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>$recordPath = "$HOME\.sideline\control-plane.json"
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>$tokenPath  = "$HOME\.sideline\token"
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
]633;D]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>$cp = Get-Content $recordPath -Raw | ConvertFrom-Json
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>$port = if ($cp.port) { $cp.port } else { 3100 }
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
]633;D]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>$token = $null
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>foreach ($candidate in @($cp.token, $cp.authToken, $cp.localToken)) {
    if ($candidate) { $token = $candidate; break }
}
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>if (-not $token -and (Test-Path $tokenPath)) {
    $token = (Get-Content $tokenPath -Raw).Trim()
}
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
]633;D]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>$headers = @{}
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>if ($token) {
    $headers.Authorization = "Bearer $token"
}
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
]633;D]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>function Find-GameId {
    param(
        $Object,
        [string]$Name
    )

    if ($null -eq $Object) { return $null }

    if ($Object -is [System.Collections.IEnumerable] -and
        $Object -isnot [string] -and
        $Object -isnot [System.Management.Automation.PSCustomObject]) {
        foreach ($item in $Object) {
            $found = Find-GameId $item $Name
            if ($found) { return $found }
        }
        return $null
    }

    if ($Object -is [System.Management.Automation.PSCustomObject]) {
        $json = $Object | ConvertTo-Json -Depth 20 -Compress

        if ($Object.PSObject.Properties.Name -contains 'gameId' -and
            $json -match [regex]::Escape($Name)) {
            return $Object.gameId
        }

        foreach ($p in $Object.PSObject.Properties) {
            $found = Find-GameId $p.Value $Name
            if ($found) { return $found }
        }
    }

    return $null
}
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
]633;D]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>$diag   = Invoke-RestMethod "http://127.0.0.1:$port/api/diagnostics" -Headers $headers
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>$status = Invoke-RestMethod "http://127.0.0.1:$port/api/status" -Headers $headers
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
]633;D]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>$targets = @(
    'Trend and Tap Assist',
    'SidelineCoach-GameTest'
)
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
]633;D]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
PS>foreach ($name in $targets) {

    $gameId = Find-GameId $diag $name
    if (-not $gameId) {
        $gameId = Find-GameId $status $name
    }

    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "$name" -ForegroundColor Cyan
    Write-Host "Game ID: $gameId"

    if (-not $gameId) {
        Write-Host "❓ Could not locate Game ID" -ForegroundColor Yellow
        continue
    }

    $encoded = [uri]::EscapeDataString($gameId)
    $url = "http://127.0.0.1:$port/api/routines/sources/browse?gameId=$encoded"

    try {
        $result = Invoke-RestMethod $url -Headers $headers
        Write-Host "✅ BROWSE SUCCEEDED" -ForegroundColor Green
        $result | ConvertTo-Json -Depth 10
    }
    catch {
        Write-Host "❌ BROWSE FAILED" -ForegroundColor Red

        if ($_.ErrorDetails.Message) {
            Write-Host $_.ErrorDetails.Message
        }
        else {
            Write-Host ($_ | Out-String)
        }
    }
}

========================================
Trend and Tap Assist
Game ID: game_git_ede05e94
✅ BROWSE SUCCEEDED
{
    "success":  true,
    "gameId":  "game_git_ede05e94",
    "dir":  "",
    "entries":  [
                    {
                        "name":  "Docs",
                        "path":  "Docs",
                        "kind":  "folder"
                    },
                    {
                        "name":  "FILE examples",
                        "path":  "FILE examples",
                        "kind":  "folder"
                    },
                    {
                        "name":  "Onboarding-Docs",
                        "path":  "Onboarding-Docs",
                        "kind":  "folder"
                    },
                    {
                        "name":  "Reports",
                        "path":  "Reports",
                        "kind":  "folder"
                    },
                    {
                        "name":  ".gitattributes",
                        "path":  ".gitattributes",
                        "kind":  "file"
                    },
                    {
                        "name":  "README.md",
                        "path":  "README.md",
                        "kind":  "file"
                    }
                ]
}

========================================
SidelineCoach-GameTest
Game ID: game_git_c3f83b48
✅ BROWSE SUCCEEDED
{
    "success":  true,
    "gameId":  "game_git_c3f83b48",
    "dir":  "",
    "entries":  [
                    {
                        "name":  ".vscode",
                        "path":  ".vscode",
                        "kind":  "folder"
                    },
                    {
                        "name":  "Diagnostics",
                        "path":  "Diagnostics",
                        "kind":  "folder"
                    },
                    {
                        "name":  "Docs ANCHOR",
                        "path":  "Docs ANCHOR",
                        "kind":  "folder"
                    },
                    {
                        "name":  "Project SOP",
                        "path":  "Project SOP",
                        "kind":  "folder"
                    },
                    {
                        "name":  "REPORTS",
                        "path":  "REPORTS",
                        "kind":  "folder"
                    },
                    {
                        "name":  "src",
                        "path":  "src",
                        "kind":  "folder"
                    },
                    {
                        "name":  "test",
                        "path":  "test",
                        "kind":  "folder"
                    },
                    {
                        "name":  "tools",
                        "path":  "tools",
                        "kind":  "folder"
                    },
                    {
                        "name":  ".gitignore",
                        "path":  ".gitignore",
                        "kind":  "file"
                    },
                    {
                        "name":  ".vscodeignore",
                        "path":  ".vscodeignore",
                        "kind":  "file"
                    },
                    {
                        "name":  "LICENSE",
                        "path":  "LICENSE",
                        "kind":  "file"
                    },
                    {
                        "name":  "package-lock.json",
                        "path":  "package-lock.json",
                        "kind":  "file"
                    },
                    {
                        "name":  "package.json",
                        "path":  "package.json",
                        "kind":  "file"
                    },
                    {
                        "name":  "README.md",
                        "path":  "README.md",
                        "kind":  "file"
                    },
                    {
                        "name":  "tsconfig.json",
                        "path":  "tsconfig.json",
                        "kind":  "file"
                    }
                ]
}
]633;D;0]633;A]633;P;Cwd=C:\x5cUsers\x5cdmcal\x5cDocuments\x5cGitHub\x5cSidelineCoachPS C:\Users\dmcal\Documents\GitHub\SidelineCoach> ]633;B
