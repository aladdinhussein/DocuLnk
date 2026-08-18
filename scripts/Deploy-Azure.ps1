[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory = $true)]
  [string]$SubscriptionId,

  [Parameter(Mandatory = $false)]
  [string]$Location = 'eastus',

  [Parameter(Mandatory = $false)]
  [string]$ResourceGroup = 'rg-doculnk-prod',

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{3,24}$')]
  [string]$StorageAccount,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9-]{2,60}$')]
  [string]$FunctionApp,

  [Parameter(Mandatory = $false)]
  [ValidatePattern('^[a-z0-9-]{2,60}$')]
  [string]$CommunicationServices = "acs-doculnk-$Location",

  [Parameter(Mandatory = $true)]
  [string]$PublicBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$EmailSenderAddress,

  [Parameter(Mandatory = $false)]
  [string]$AdminEmail = '',

  [Parameter(Mandatory = $false)]
  [int]$RetentionDays = 365,

  [Parameter(Mandatory = $false)]
  [ValidatePattern('^$|^[0-9a-fA-F-]{36}$')]
  [string]$AadTenantId = '',

  [Parameter(Mandatory = $false)]
  [ValidatePattern('^$|^[0-9a-fA-F-]{36}$')]
  [string]$AadClientId = '',

  [Parameter(Mandatory = $false)]
  [switch]$SkipCommunicationServices,

  [Parameter(Mandatory = $false)]
  [string]$CommunicationServicesConnectionString = $env:DOCULNK_COMMUNICATION_SERVICES_CONNECTION_STRING,

  [Parameter(Mandatory = $false)]
  [switch]$DeployApi
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Azure {
  param([string[]]$Arguments)
  & az @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI command failed: az $($Arguments -join ' ')"
  }
}

function Get-AzureText {
  param([string[]]$Arguments)
  $result = & az @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI command failed: az $($Arguments -join ' ')"
  }
  return ($result | Out-String).Trim()
}

Write-Host 'Checking Azure CLI login...' -ForegroundColor Cyan
$account = & az account show 2>$null
if ($LASTEXITCODE -ne 0 -or -not $account) {
  az login | Out-Null
}

Invoke-Azure @('account', 'set', '--subscription', $SubscriptionId)

Write-Host "Creating or updating resource group $ResourceGroup..." -ForegroundColor Cyan
Invoke-Azure @('group', 'create', '--name', $ResourceGroup, '--location', $Location, '--output', 'none')

Write-Host "Creating Storage account $StorageAccount..." -ForegroundColor Cyan
Invoke-Azure @(
  'storage', 'account', 'create',
  '--name', $StorageAccount,
  '--resource-group', $ResourceGroup,
  '--location', $Location,
  '--sku', 'Standard_LRS',
  '--kind', 'StorageV2',
  '--min-tls-version', 'TLS1_2',
  '--allow-blob-public-access', 'false',
  '--https-only', 'true',
  '--output', 'none'
)

$StorageConnection = Get-AzureText @(
  'storage', 'account', 'show-connection-string',
  '--name', $StorageAccount,
  '--resource-group', $ResourceGroup,
  '--query', 'connectionString',
  '--output', 'tsv'
)

foreach ($container in @('templates', 'signed-documents')) {
  Write-Host "Creating private Blob container $container..." -ForegroundColor Cyan
  Invoke-Azure @(
    'storage', 'container', 'create',
    '--name', $container,
    '--connection-string', $StorageConnection,
    '--public-access', 'off',
    '--output', 'none'
  )
}

$FunctionStorage = "$($StorageAccount.Substring(0, [Math]::Min($StorageAccount.Length, 18)))func"
$FunctionStorage = $FunctionStorage.ToLowerInvariant()
if ($FunctionStorage.Length -gt 24) {
  $FunctionStorage = $FunctionStorage.Substring(0, 24)
}

Write-Host "Creating Function runtime Storage account $FunctionStorage..." -ForegroundColor Cyan
Invoke-Azure @(
  'storage', 'account', 'create',
  '--name', $FunctionStorage,
  '--resource-group', $ResourceGroup,
  '--location', $Location,
  '--sku', 'Standard_LRS',
  '--kind', 'StorageV2',
  '--https-only', 'true',
  '--output', 'none'
)

Write-Host "Creating Function App $FunctionApp..." -ForegroundColor Cyan
Invoke-Azure @(
  'functionapp', 'create',
  '--name', $FunctionApp,
  '--resource-group', $ResourceGroup,
  '--storage-account', $FunctionStorage,
  '--consumption-plan-location', $Location,
  '--runtime', 'node',
  '--runtime-version', '20',
  '--functions-version', '4',
  '--os-type', 'Linux',
  '--output', 'none'
)

if (-not $SkipCommunicationServices) {
  Write-Host "Creating Communication Services resource $CommunicationServices..." -ForegroundColor Cyan
  Invoke-Azure @(
    'communication', 'create',
    '--name', $CommunicationServices,
    '--resource-group', $ResourceGroup,
    '--location', 'global',
    '--data-location', 'United States',
    '--output', 'none'
  )
}

$FunctionHost = Get-AzureText @(
  'functionapp', 'show',
  '--name', $FunctionApp,
  '--resource-group', $ResourceGroup,
  '--query', 'defaultHostName',
  '--output', 'tsv'
)

Write-Host "Configuring CORS for origin $PublicBaseUrl..." -ForegroundColor Cyan
Invoke-Azure @(
  'functionapp', 'cors', 'add',
  '--name', $FunctionApp,
  '--resource-group', $ResourceGroup,
  '--allowed-origins', $PublicBaseUrl,
  '--output', 'none'
)
Invoke-Azure @(
  'functionapp', 'cors', 'credentials',
  '--name', $FunctionApp,
  '--resource-group', $ResourceGroup,
  '--enable', 'true',
  '--output', 'none'
)

$FunctionSettings = @(
  'FUNCTIONS_WORKER_RUNTIME=node',
  "DOCULNK_STORAGE_CONNECTION_STRING=$StorageConnection",
  'DOCULNK_TABLE_NAME=DocuLnkRecords',
  'DOCULNK_TEMPLATE_CONTAINER=templates',
  'DOCULNK_SIGNED_CONTAINER=signed-documents',
  "DOCULNK_EMAIL_SENDER_ADDRESS=$EmailSenderAddress",
  "DOCULNK_ADMIN_EMAIL=$AdminEmail",
  "DOCULNK_RETENTION_DAYS=$RetentionDays"
)

if ($CommunicationServicesConnectionString) {
  $FunctionSettings += "DOCULNK_COMMUNICATION_SERVICES_CONNECTION_STRING=$CommunicationServicesConnectionString"
}

# Without both values the API cannot build its JWKS and rejects every admin request
# with 401 "Authentication required", regardless of the token presented.
if ($AadTenantId -and $AadClientId) {
  $FunctionSettings += "DOCULNK_AAD_TENANT_ID=$AadTenantId"
  $FunctionSettings += "DOCULNK_AAD_CLIENT_ID=$AadClientId"
}
else {
  Write-Warning 'AadTenantId/AadClientId not supplied. Admin API routes will return 401 until DOCULNK_AAD_TENANT_ID and DOCULNK_AAD_CLIENT_ID are set on the Function App.'
}

Write-Host 'Applying Function App settings...' -ForegroundColor Cyan
$SettingsArguments = @(
  'functionapp', 'config', 'appsettings', 'set',
  '--name', $FunctionApp,
  '--resource-group', $ResourceGroup,
  '--settings'
) + $FunctionSettings + @('--output', 'none')
Invoke-Azure $SettingsArguments

if ($DeployApi) {
  if (-not (Get-Command func -ErrorAction SilentlyContinue)) {
    throw 'The -DeployApi switch requires Azure Functions Core Tools (func) to be installed.'
  }
  Write-Host 'Building and deploying the API...' -ForegroundColor Cyan
  Push-Location (Join-Path $PSScriptRoot '..\api')
  try {
    npm install
    npm run build
    func azure functionapp publish $FunctionApp
  }
  finally {
    Pop-Location
  }
}

Write-Host ''
Write-Host 'Azure resources are ready for deployment.' -ForegroundColor Green
Write-Host "Function API URL: https://$FunctionHost/api"
Write-Host ''
Write-Host 'Manual steps still required:' -ForegroundColor Yellow
Write-Host '1. Retrieve the ACS connection string from the Azure Portal and set DOCULNK_COMMUNICATION_SERVICES_CONNECTION_STRING.'
Write-Host '2. Verify the ACS sender domain and DNS records.'
Write-Host '3. Create/configure the Static Web App and connect the GitHub repository.'
Write-Host '4. Configure Microsoft Entra ID and authorized admin users.'
Write-Host '5. Set VITE_API_BASE_URL and VITE_ENABLE_AUTH in the Static Web Apps build environment.'
Write-Host '6. Deploy the api directory with Azure Functions Core Tools, or rerun with -DeployApi.'
Write-Host ''
Write-Host 'Do not commit connection strings or deployment tokens.' -ForegroundColor Yellow
