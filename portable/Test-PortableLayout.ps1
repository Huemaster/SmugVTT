#requires -Version 5.1
<#
.SYNOPSIS
  Non-mutating layout preflight for a proposed SmugVTT Windows portable bundle.
.DESCRIPTION
  Checks only expected file presence. Never starts programs, creates directories,
  reads secrets, downloads components, or modifies a database.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BundleRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
try {
    $root = Get-Item -LiteralPath $BundleRoot -ErrorAction Stop
    if (-not $root.PSIsContainer) { throw 'BundleRoot must be a directory.' }
    if (($root.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Refusing a reparse-point bundle root.'
    }
    $required = @(
        'runtime/node/node.exe',
        'runtime/postgres/bin/initdb.exe',
        'runtime/postgres/bin/pg_ctl.exe',
        'runtime/postgres/bin/postgres.exe',
        'runtime/postgres/bin/pg_isready.exe',
        'runtime/postgres/bin/psql.exe',
        'runtime/postgres/bin/pg_dump.exe',
        'app/backend/dist/server.js',
        'app/backend/prisma/schema.prisma',
        'app/frontend/index.html'
    )
    $missing = @()
    foreach ($relative in $required) {
        $path = Join-Path $root.FullName ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            $missing += $relative
        }
    }
    if ($missing.Count -gt 0) {
        Write-Host 'Portable layout incomplete (expected at this stage):'
        foreach ($item in $missing) { Write-Host ('  MISSING: ' + $item) }
        exit 1
    }
    Write-Host 'Layout-only check passed. Binaries were NOT authenticated or executed.'
    Write-Host 'This is NOT a working or security-verified portable build.'
    exit 0
}
catch {
    Write-Error ('Portable layout preflight failed: ' + $_.Exception.Message)
    exit 1
}
