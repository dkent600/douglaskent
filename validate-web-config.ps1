<#
    .SYNOPSIS
        Checks that web.config is well-formed XML before it is uploaded.

    .DESCRIPTION
        Run automatically by npm as the `predeploy` script, so a broken config
        aborts the deploy instead of reaching the server.

        IIS does not tolerate a malformed web.config the way a browser tolerates
        malformed HTML: it answers HTTP 500.19 for every request to the site, so a
        single bad character takes the whole thing down. Nothing else in the build
        reads this file, which is how a stray `--` inside an XML comment once shipped
        to main unnoticed.

        This is a well-formedness check only. It will not catch a setting that is
        valid XML but wrong, such as a rewrite rule that no longer matches the app's
        routes.
#>

$ErrorActionPreference = "Stop"

$path = Join-Path $PSScriptRoot "web.config"

if (-not (Test-Path -LiteralPath $path)) {
    Write-Host "web.config not found at $path" -ForegroundColor Red
    exit 1
}

# XmlDocument.Load reports the offending line and column; casting with [xml] buries
# that inside a "Cannot convert value ..." message that quotes the entire file back.
$document = New-Object System.Xml.XmlDocument
try {
    $document.Load($path)
}
catch [System.Xml.XmlException] {
    Write-Host "web.config is not well-formed XML. IIS would answer HTTP 500.19 for every request." -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Deploy aborted." -ForegroundColor Red
    exit 1
}

Write-Host "web.config: well-formed XML" -ForegroundColor Green
