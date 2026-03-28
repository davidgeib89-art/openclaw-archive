[CmdletBinding()]
param(
    [ValidateSet("gateway", "agent", "dashboard", "status")]
    [string]$Mode = "gateway",

    [string]$ApiKey = $env:FIREWORKS_API_KEY,

    [string]$BaseUrl = "https://api.fireworks.ai/inference/v1",

    [string]$ModelId = "accounts/fireworks/routers/kimi-k2p5-turbo",

    [string]$AgentId = "main",

    [string]$WorkspacePath,

    [string]$Message = "Reply with exactly FIREWORKS_OPENCLAW_OK.",

    [string]$GatewayToken = $env:OPENCLAW_GATEWAY_TOKEN,

    [switch]$Force,

    [int]$Port = 18789
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$worktreesRoot = (Split-Path $repoRoot -Parent)
$defaultDgdhWorkspace = Join-Path $worktreesRoot "dgdh-werkbank"
$localRoot = Join-Path $repoRoot ".local\fireworks"
$configPath = Join-Path $localRoot "openclaw.json"
$gatewayTokenPath = Join-Path $localRoot "gateway-token.txt"
$distEntryJs = Join-Path $repoRoot "dist\entry.js"
$distEntryMjs = Join-Path $repoRoot "dist\entry.mjs"
$openClawEntry = Join-Path $repoRoot "openclaw.mjs"

if ($Mode -eq "agent" -and -not $ApiKey) {
    throw "No Fireworks API key found. Pass -ApiKey or set FIREWORKS_API_KEY."
}

New-Item -ItemType Directory -Path $localRoot -Force | Out-Null

if (-not $GatewayToken -and (Test-Path $gatewayTokenPath)) {
    $GatewayToken = (Get-Content -Path $gatewayTokenPath -Raw).Trim()
}

if (-not $GatewayToken) {
    $GatewayToken = [Guid]::NewGuid().ToString("N")
}

Set-Content -Path $gatewayTokenPath -Value ($GatewayToken + "`n") -Encoding ascii

if (-not $WorkspacePath) {
    if (Test-Path $defaultDgdhWorkspace) {
        $WorkspacePath = $defaultDgdhWorkspace
    }
    else {
        $WorkspacePath = $repoRoot
    }
}

$WorkspacePath = (Resolve-Path $WorkspacePath).Path

$config = [ordered]@{
    gateway = [ordered]@{
        mode = "local"
        port = $Port
        auth = [ordered]@{
            mode = "token"
            token = '${OPENCLAW_GATEWAY_TOKEN}'
        }
    }
    agents = [ordered]@{
        defaults = [ordered]@{
            workspace = $WorkspacePath
            model = [ordered]@{
                primary = "fireworks/$ModelId"
            }
        }
    }
    models = [ordered]@{
        mode = "merge"
        providers = [ordered]@{
            fireworks = [ordered]@{
                baseUrl = $BaseUrl
                api = "openai-completions"
                auth = "token"
                authHeader = $true
                apiKey = '${FIREWORKS_API_KEY}'
                models = @(
                    [ordered]@{
                        id = $ModelId
                        name = "Fireworks Kimi K2.5 Turbo"
                        reasoning = $false
                        input = @("text")
                        cost = [ordered]@{
                            input = 0
                            output = 0
                            cacheRead = 0
                            cacheWrite = 0
                        }
                        contextWindow = 200000
                        maxTokens = 8192
                    }
                )
            }
        }
    }
}

($config | ConvertTo-Json -Depth 100) + "`n" | Set-Content -Path $configPath -Encoding utf8

if ($ApiKey) {
    $env:FIREWORKS_API_KEY = $ApiKey
}
$env:OPENCLAW_GATEWAY_TOKEN = $GatewayToken
$env:OPENCLAW_CONFIG_PATH = $configPath
$env:OPENCLAW_AGENT_DIR = $localRoot
$env:PI_CODING_AGENT_DIR = $localRoot
$env:OPENCLAW_SKIP_CHANNELS = "1"

Write-Host "Config path: $configPath"
Write-Host "Gateway token: $GatewayToken"
Write-Host "Workspace: $WorkspacePath"
Write-Host "Primary model: fireworks/$ModelId"

Push-Location $repoRoot
try {
    if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
        throw "Dependencies are missing. Run 'pnpm install' in the repo first."
    }

    if (-not (Test-Path $distEntryJs) -and -not (Test-Path $distEntryMjs)) {
        pnpm build
    }

    if ($Mode -eq "gateway") {
        $gatewayArgs = @($openClawEntry, "gateway", "--verbose")
        if ($Force) {
            $gatewayArgs += "--force"
        }
        & node @gatewayArgs
    }
    elseif ($Mode -eq "status") {
        & node $openClawEntry gateway status
    }
    elseif ($Mode -eq "dashboard") {
        & node $openClawEntry dashboard --no-open
    }
    else {
        & node $openClawEntry agent --agent $AgentId --message $Message
    }
}
finally {
    Pop-Location
}