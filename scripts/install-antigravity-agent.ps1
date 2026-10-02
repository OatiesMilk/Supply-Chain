$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$pluginSourceRoot = Join-Path $repositoryRoot '.gemini'
$agentPluginRoot = Join-Path $env:USERPROFILE '.gemini/config/plugins/supply-chain-dev-plugin'
$antigravityCommand = Get-Command agy -CommandType Application -ErrorAction Stop
$pluginFiles = @(
    'plugin.json'
    'agents/supply-chain-dev.md'
    'skills/use-supply-chain-dev/SKILL.md'
)

foreach ($relativePath in $pluginFiles) {
    $sourcePath = Join-Path $pluginSourceRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Required plugin file is missing: $sourcePath"
    }
}

& $antigravityCommand.Source plugin install $pluginSourceRoot
if ($LASTEXITCODE -ne 0) {
    throw 'Antigravity plugin installation failed.'
}

& $antigravityCommand.Source plugin enable 'supply-chain-dev-plugin'
if ($LASTEXITCODE -ne 0) {
    throw 'Antigravity plugin activation failed.'
}

foreach ($relativePath in $pluginFiles) {
    $sourcePath = Join-Path $pluginSourceRoot $relativePath
    $destinationPath = Join-Path $agentPluginRoot $relativePath
    $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
    $installedHash = (Get-FileHash -LiteralPath $destinationPath -Algorithm SHA256).Hash
    if ($sourceHash -ne $installedHash) {
        throw "Installed plugin file differs from source: $relativePath"
    }
}

Write-Output "Installed Supply Chain implementation agent at $agentPluginRoot"
Write-Output 'Run agy agents to confirm supply-chain-dev is available.'
