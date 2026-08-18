# DocuLnk Azure Deployment Guide

This guide deploys DocuLnk as:

- Azure Static Web Apps Free for the React/Vite front end
- A separate Azure Functions app on the Consumption plan for the API
- One Azure Storage account for Blob Storage and Table Storage
- Azure Communication Services Email for signed-PDF delivery
- Microsoft Entra ID for admin authentication
- Application Insights for API monitoring

The application is designed for low volume, approximately 100 signed documents per year. Azure prices vary by region, subscription, currency, and plan. Confirm costs in the Azure pricing calculator before creating resources.

## 1. Prerequisites

Install and sign in to the tools below:

- Node.js 20 or newer
- Git
- Azure CLI
- Azure Functions Core Tools v4
- An Azure subscription
- A GitHub repository, if using GitHub Actions deployment

Sign in and choose the subscription:

```powershell
az login
az account list --output table
az account set --subscription "<SUBSCRIPTION_NAME_OR_ID>"
```

Choose a region. Keep the Storage account, Function App, and Communication Services resource in the same region when practical. Example:

```powershell
$Location = "eastus"
$ResourceGroup = "rg-doculnk-prod"
$StorageAccount = "doculnkprod<UNIQUE_SUFFIX>"
$FunctionApp = "func-doculnk-prod-<UNIQUE_SUFFIX>"
$CommunicationServices = "acs-doculnk-prod"
```

Storage account names must be globally unique, lowercase, and 3-24 characters.

## 2. Create the resource group

```powershell
az group create `
  --name $ResourceGroup `
  --location $Location
```

## Automated bootstrap option

The repeatable Azure resource setup can be run with [scripts/Deploy-Azure.ps1](scripts/Deploy-Azure.ps1). It creates or updates the resource group, Storage accounts, private Blob containers, Function App, Communication Services resource, and Function App settings.

The script requires Azure CLI. Run it from the repository root:

```powershell
az login

./scripts/Deploy-Azure.ps1 `
  -SubscriptionId "<SUBSCRIPTION_ID>" `
  -Location "eastus" `
  -ResourceGroup "rg-doculnk-prod" `
  -StorageAccount "doculnkprod123456" `
  -FunctionApp "func-doculnk-prod-123456" `
  -PublicBaseUrl "https://<STATIC_WEB_APP_HOSTNAME>" `
  -EmailSenderAddress "donotreply@sign.example.com" `
  -AdminEmail "admin@example.com" `
  -AadTenantId "<TENANT_ID>" `
  -AadClientId "<APP_ID>"
```

`-AadTenantId` and `-AadClientId` set `DOCULNK_AAD_TENANT_ID` and `DOCULNK_AAD_CLIENT_ID` on the Function App. Omitting them leaves the API unable to validate tokens, so every admin route returns 401 `Authentication required` no matter what token the front end sends. The script warns when they are not supplied. They can also be set separately with the command in [step 9](#9-configure-entra-id-authentication).

To inject the ACS connection string without putting it in the command history, set it in the current PowerShell process first:

```powershell
$env:DOCULNK_COMMUNICATION_SERVICES_CONNECTION_STRING = "<ACS_CONNECTION_STRING>"
./scripts/Deploy-Azure.ps1 `
  -SubscriptionId "<SUBSCRIPTION_ID>" `
  -StorageAccount "doculnkprod123456" `
  -FunctionApp "func-doculnk-prod-123456" `
  -PublicBaseUrl "https://<STATIC_WEB_APP_HOSTNAME>" `
  -EmailSenderAddress "donotreply@sign.example.com"
```

Add `-DeployApi` after installing Azure Functions Core Tools to build and publish the `api` directory as part of the same run:

```powershell
./scripts/Deploy-Azure.ps1 `
  -SubscriptionId "<SUBSCRIPTION_ID>" `
  -StorageAccount "doculnkprod123456" `
  -FunctionApp "func-doculnk-prod-123456" `
  -PublicBaseUrl "https://<STATIC_WEB_APP_HOSTNAME>" `
  -EmailSenderAddress "donotreply@sign.example.com" `
  -DeployApi
```

The script cannot safely automate DNS ownership verification, Entra application consent, ACS sender-domain verification, GitHub authorization, or Static Web Apps repository connection. Complete those steps manually in the Azure Portal, then rerun the script with the final public URL and verified sender address.

## 3. Create the Storage account

Create a General Purpose v2, locally redundant storage account. LRS is the lowest-cost choice for this low-volume MVP.

```powershell
az storage account create `
  --name $StorageAccount `
  --resource-group $ResourceGroup `
  --location $Location `
  --sku Standard_LRS `
  --kind StorageV2 `
  --min-tls-version TLS1_2 `
  --allow-blob-public-access false `
  --https-only true
```

Get the connection string:

```powershell
$StorageConnection = az storage account show-connection-string `
  --name $StorageAccount `
  --resource-group $ResourceGroup `
  --query connectionString `
  --output tsv
```

Create the Blob containers. The containers must remain private:

```powershell
az storage container create `
  --name templates `
  --connection-string $StorageConnection `
  --public-access off

az storage container create `
  --name signed-documents `
  --connection-string $StorageConnection `
  --public-access off
```

The API creates the `DocuLnkRecords` Table Storage table automatically on its first request.

## 4. Create Azure Communication Services

Create the ACS resource:

```powershell
az communication create `
  --name $CommunicationServices `
  --resource-group $ResourceGroup `
  --location global `
  --data-location United States
```

In the Azure Portal:

1. Open the Communication Services resource.
2. Open **Email**.
3. Create or connect an Email Communication Services resource if the portal requests it.
4. Add a verified custom domain, or use a verified Azure-managed domain for initial testing.
5. Verify the required DNS records at your domain provider.
6. Record the sender address, for example `donotreply@sign.example.com`.

Get the ACS connection string from the resource's **Keys** page. Do not commit it to Git or put it in front-end environment variables.

The sender domain must be verified before invitations can be sent reliably.

## 5. Create the Function App

Create a Linux Consumption-plan Function App. The API is a Node.js/TypeScript Azure Functions v4 app.

```powershell
$FunctionStorage = "funcdoculnk<UNIQUE_SUFFIX>"

az storage account create `
  --name $FunctionStorage `
  --resource-group $ResourceGroup `
  --location $Location `
  --sku Standard_LRS `
  --kind StorageV2 `
  --https-only true

az functionapp create `
  --name $FunctionApp `
  --resource-group $ResourceGroup `
  --storage-account $FunctionStorage `
  --consumption-plan-location $Location `
  --runtime node `
  --runtime-version 20 `
  --functions-version 4 `
  --os-type Linux
```

Get the Function App hostname:

```powershell
$FunctionHost = az functionapp show `
  --name $FunctionApp `
  --resource-group $ResourceGroup `
  --query defaultHostName `
  --output tsv

$ApiBaseUrl = "https://$FunctionHost/api"
```

## 6. Configure Function App settings

Set these values on the Function App. Use the Storage account connection string from step 3, not the Function host storage account unless you intentionally want to share them.

```powershell
$AcsConnection = "<ACS_CONNECTION_STRING>"
$EmailSender = "donotreply@sign.example.com"
$AdminEmail = "admin@example.com"
$PublicBaseUrl = "https://<STATIC_WEB_APP_HOSTNAME>"

az functionapp config appsettings set `
  --name $FunctionApp `
  --resource-group $ResourceGroup `
  --settings `
    FUNCTIONS_WORKER_RUNTIME=node `
    DOCULNK_STORAGE_CONNECTION_STRING="$StorageConnection" `
    DOCULNK_TABLE_NAME=DocuLnkRecords `
    DOCULNK_TEMPLATE_CONTAINER=templates `
    DOCULNK_SIGNED_CONTAINER=signed-documents `
    DOCULNK_COMMUNICATION_SERVICES_CONNECTION_STRING="$AcsConnection" `
    DOCULNK_EMAIL_SENDER_ADDRESS="$EmailSender" `
    DOCULNK_ADMIN_EMAIL="$AdminEmail" `
    DOCULNK_RETENTION_DAYS=365
```

Do not print these settings in shell logs, CI output, screenshots, or issue comments. Prefer a managed identity and Key Vault references for a hardened production deployment. Connection strings are supported for the initial low-volume deployment.

## 7. Build and deploy the API

Install dependencies and compile locally:

```powershell
Set-Location api
npm install
npm run build
Set-Location ..
```

Deploy with Azure Functions Core Tools. The command packages and publishes the `api` directory:

```powershell
func azure functionapp publish $FunctionApp --typescript
```

If the command cannot detect the project, run it from the `api` directory:

```powershell
Set-Location api
func azure functionapp publish $FunctionApp
Set-Location ..
```

After deployment, check the Function App **Log stream** and **Application Insights** for startup errors. The API should be able to create the Table Storage table and Blob containers on its first request.

## 8. Create the Static Web App

Create the front-end Static Web App. The Free plan is sufficient for the expected traffic. The separate Function App is used as the API, so this does not rely on a paid managed API plan.

Portal method:

1. Open **Static Web Apps** in the Azure Portal.
2. Select **Create**.
3. Choose the subscription and resource group.
4. Enter an app name and choose the Free plan.
5. Choose the region nearest your administrators and signers.
6. Connect the GitHub repository and branch.
7. Set **Build Presets** to Custom.
8. Set **App location** to `/`.
9. Leave **API location** empty because the API is deployed separately.
10. Set **Output location** to `dist`.
11. Create the resource.

The repository's `staticwebapp.config.json` must be deployed with the front-end output. It contains:

- Public `/form/*` routes
- Public `/api/public/forms/*` and submission download routes
- Authenticated `/api/*` admin routes
- Security headers
- Static SPA fallback to `index.html`

## 9. Configure Microsoft Entra ID admin sign-in

The app uses a dedicated Entra ID App Registration and MSAL (`@azure/msal-browser`) for admin sign-in, rather than the Static Web Apps built-in `/.auth/login/aad` quickstart. The quickstart provider is a shared, unconfigurable Microsoft app and cannot expose custom app roles or an API scope, so the API cannot validate its tokens.

Create the app registration:

```powershell
az ad app create --display-name "DocuLnk" --sign-in-audience AzureADMyOrg
```

Then, using the returned `appId` and `id` (object id):

1. Set the Application ID URI to `api://<appId>`.
2. Add a delegated OAuth2 permission scope named `access_as_user` under **Expose an API**.
3. Add an App Role named `Admin` (value `Admin`, allowed member type `Users`) under **App roles**.
4. Add a **Single-page application** platform with redirect URIs for the Static Web App URL and `http://localhost:5173` (development).
5. Add a required resource access entry pointing the app at its own `access_as_user` scope, so the SPA can request it.
6. Create the service principal (`az ad sp create --id <appId>`), grant admin consent (`az ad app permission admin-consent --id <appId>`), and assign each admin user to the `Admin` app role via Microsoft Graph (`servicePrincipals/{spId}/appRoleAssignedTo`) or the Enterprise Applications blade in the Portal.

Set the Function App settings so the API can validate tokens:

```powershell
az functionapp config appsettings set `
  --name $FunctionApp `
  --resource-group $ResourceGroup `
  --settings DOCULNK_AAD_TENANT_ID="<TENANT_ID>" DOCULNK_AAD_CLIENT_ID="<APP_ID>"
```

The front end enables its admin gate and MSAL sign-in with:

```env
VITE_ENABLE_AUTH=true
VITE_AAD_CLIENT_ID=<APP_ID>
VITE_AAD_TENANT_ID=<TENANT_ID>
```

The API independently validates the bearer token's signature, issuer, audience, and `Admin` app role on admin routes. Do not rely only on the front-end gate.

## 10. Configure front-end build variables

Create `.env.local` for local testing, or configure the values in the Static Web Apps build environment:

```env
VITE_API_BASE_URL=https://<FUNCTION_HOSTNAME>/api
VITE_ENABLE_AUTH=true
VITE_AAD_CLIENT_ID=<APP_ID>
VITE_AAD_TENANT_ID=<TENANT_ID>
VITE_SUPPORT_EMAIL=admin@example.com
```

For a same-origin reverse proxy, use:

```env
VITE_API_BASE_URL=/api
```

The current Static Web Apps configuration assumes the API is exposed under `/api`. If the Function App remains on its separate hostname, use the full HTTPS Function URL or configure a proxy/rewrite in front of it and verify CORS and authentication behavior.

Build the front end:

```powershell
npm install
npm run build
```

## 11. Deploy the front end

For GitHub deployment, the Static Web Apps resource creates a GitHub Actions workflow. Commit and push:

```powershell
git add .
git commit -m "Prepare Azure deployment"
git push
```

Confirm the workflow succeeds in GitHub Actions. The deployment should publish the `dist` directory.

For a manual deployment, use the Static Web Apps CLI or the deployment token from the Azure Portal. Keep the deployment token in a secret store, never in the repository.

## 12. Configure CORS if using the Function hostname

If `VITE_API_BASE_URL` points directly to the Function App hostname, add the Static Web App URL to the Function App CORS list:

```powershell
az functionapp cors add `
  --name $FunctionApp `
  --resource-group $ResourceGroup `
  --allowed-origins "https://<STATIC_WEB_APP_HOSTNAME>"
```

Also configure the local Vite origin only for development:

```powershell
az functionapp cors add `
  --name $FunctionApp `
  --resource-group $ResourceGroup `
  --allowed-origins "http://localhost:5173"
```

The front end sends the Entra ID access token as an `Authorization: Bearer` header, not a cookie, so the Function App does not need `Access-Control-Allow-Credentials`. Leaving it enabled is harmless but unnecessary.

Use HTTPS in production. Do not use `*` for allowed origins when credentials or authentication are involved.

## 13. Configure the custom domain

Optional:

1. Open the Static Web App resource.
2. Open **Custom domains**.
3. Add the production hostname.
4. Create the requested DNS record.
5. Wait for validation and certificate provisioning.
7. Redeploy or restart the Function App.
8. Update ACS email links will then use the final hostname.

## 14. Configure monitoring and alerts

Enable Application Insights for the Function App. Start with low-cost default retention and monitor usage before increasing it.

Create alerts for:

- Function failures
- ACS email failures
- HTTP 401/403 spikes
- HTTP 429 rate-limit responses
- Blob or Table Storage failures
- Function startup failures
- Unexpected increases in signed-document volume

Never log PDF content, signatures, access tokens, connection strings, or full email addresses unnecessarily. Use request IDs and hashes for correlation.

## 15. Configure retention and backups

The daily `retention-cleanup` Timer Function uses `DOCULNK_RETENTION_DAYS` and deletes completed signed PDFs older than that period. Confirm the timer is visible in the Function App before relying on it.

Before production:

- Decide the retention period with legal/business owners.
- Configure Azure Storage lifecycle management for defense in depth.
- Decide whether audit records need longer retention than PDFs.
- Enable soft delete/versioning only if the additional retention cost and privacy implications are acceptable.
- Test restoration of a representative signed document.

## 16. End-to-end verification

Run these checks after deployment:

1. Open the Static Web App URL and confirm the admin sign-in screen appears.
2. Sign in with an authorized Entra account.
3. Upload a valid PDF and confirm its SHA-256 hash is displayed.
4. Add fields on pages 1 and 2, then drag a field between pages more than once.
5. Publish the template and confirm it appears on the published-template dashboard.
6. Copy the stable public form URL.
7. Open the form URL in a separate browser profile or private window.
9. Confirm the template PDF and fields load without admin authentication.
10. Fill fields, draw a signature, accept the disclosure, and submit.
11. Confirm the signer receives a signed PDF download.
12. Confirm the admin receives the signed PDF as an attachment and can download the Blob-backed copy.
13. Complete the same public form again and confirm it creates a separate submission.
14. Temporarily break ACS delivery and confirm the submission still succeeds and remains downloadable.
15. Verify audit events and Application Insights logs contain submission IDs but no document contents.

## 17. Cost controls for this workload

For approximately 100 documents per year:

- Use Static Web Apps Free.
- Use Azure Functions Consumption or Flex Consumption without always-ready instances.
- Use one Standard LRS Storage account.
- Keep Blob containers private.
- Use ACS Email only; do not provision SMS or voice resources.
- Keep Application Insights retention modest.
- Set an Azure Cost Management budget and email alert.
- Review storage lifecycle and retention settings quarterly.

## 18. Production checklist

- [ ] Resource group created in the intended region
- [ ] Static Web Apps Free resource created
- [ ] Function App deployed and healthy
- [ ] Storage account uses HTTPS, TLS 1.2+, private Blob containers, and LRS
- [ ] Table Storage initialized
- [ ] ACS sender domain verified
- [ ] ACS sender address configured
- [ ] Function App settings configured without secrets in source control
- [ ] Entra authentication configured
- [ ] Admin role access verified
- [ ] Static Web Apps routes and security headers deployed
- [ ] Function CORS restricted to known HTTPS origins
- [ ] Retention period approved and cleanup timer verified
- [ ] Application Insights enabled
- [ ] Cost budget configured
- [ ] End-to-end signing test completed
- [ ] Michigan and federal e-signature requirements reviewed by counsel

## Notes and limitations

This architecture supports a low-volume electronic-signature workflow. It is not automatically a certificate-backed or legally certified signature service. The application does not implement notarization, identity-proofing, qualified trust services, or jurisdiction-specific legal review. Obtain legal advice for the document types and business process before production use.
