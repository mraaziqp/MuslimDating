# Apply Route 53 DNS records for nikah.arpcloudsolutions.co.za and nikahpath.arpcloudsolutions.co.za pointing to Vercel
$ErrorActionPreference = 'Stop'
$domain = "arpcloudsolutions.co.za"

Write-Host "Verifying AWS authentication..." -ForegroundColor Cyan
$whoami = aws sts get-caller-identity --output text 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "AWS session expired or absent. Please run 'aws login' in your terminal." -ForegroundColor Red
    exit 1
}

Write-Host "Locating Route 53 hosted zone for $domain..." -ForegroundColor Cyan
$rawZone = aws route53 list-hosted-zones --query "HostedZones[?Name=='$($domain).'].Id | [0]" --output text 2>&1
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rawZone) -or $rawZone -eq "None") {
    Write-Host "Hosted zone for $domain not found in this AWS account." -ForegroundColor Red
    exit 1
}
$zoneId = $rawZone.Trim() -replace '^/hostedzone/', ''

if (-not $zoneId -or $zoneId -eq "None") {
    Write-Host "Hosted zone for $domain not found in this AWS account." -ForegroundColor Red
    exit 1
}

Write-Host "Hosted Zone ID: $zoneId" -ForegroundColor Green
$jsonPath = Join-Path $PSScriptRoot "route53-nikah.json"

Write-Host "Applying DNS changes from $jsonPath..." -ForegroundColor Cyan
$res = aws route53 change-resource-record-sets --hosted-zone-id $zoneId --change-batch "file://$jsonPath" --output json | ConvertFrom-Json
$changeId = $res.ChangeInfo.Id -replace '^/change/', ''
Write-Host "Change submitted! Change ID: $changeId. Status: $($res.ChangeInfo.Status)" -ForegroundColor Green

Write-Host "Waiting for DNS records to synchronize across Route 53 nameservers..." -ForegroundColor Cyan
aws route53 wait resource-record-sets-changed --id $changeId
Write-Host "Route 53 records are INSYNC! DNS is live." -ForegroundColor Green
