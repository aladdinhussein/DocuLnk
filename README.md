# DocuLnk

DocuLnk is a PDF template and document-signing application. The front end is a React/Vite app and the production API is designed for Azure Functions, Azure Blob Storage, and Azure Table Storage.

## Current features

- Multi-page PDF template preview
- Drag and resize template fields
- Text, date, checkbox, initials, and signature fields
- Typed or drawn signatures
- Zoom and next-field signer navigation
- Signed PDF download
- Template and request lifecycle dashboard
- Request expiration and revoke states
- SHA-256 PDF integrity validation

The browser prototype currently persists data in `localStorage`. The `api` project provides the Azure persistence boundary for cross-browser use.

To enable the remote path in the front end, copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL`. Set `VITE_ENABLE_AUTH=true` when the site is configured with Microsoft Entra ID through Azure Static Web Apps.

## Development

```powershell
npm install
npm run dev
```

## Validation

```powershell
npm run lint
npm run build:all
npx vitest run src/lib/pdfIntegrity.test.ts src/lib/requestStore.test.ts
```

## Azure API setup

```powershell
Set-Location api
npm install
Copy-Item local.settings.json.example local.settings.json
npm run build
```

Configure these Function App values:

- `DOCULNK_STORAGE_CONNECTION_STRING`: Azure Storage connection string
- `DOCULNK_TABLE_NAME`: Table Storage table name, default `DocuLnkRecords`
- `DOCULNK_TEMPLATE_CONTAINER`: PDF template container, default `templates`
- `DOCULNK_SIGNED_CONTAINER`: completed PDF container, default `signed-documents`
- `DOCULNK_PUBLIC_BASE_URL`: public Static Web Apps URL
- `DOCULNK_COMMUNICATION_SERVICES_CONNECTION_STRING`: Azure Communication Services resource connection string
- `DOCULNK_EMAIL_SENDER_ADDRESS`: verified ACS sender address, for example `donotreply@your-verified-domain`
- `DOCULNK_ADMIN_EMAIL`: optional address notified after a document is completed
- `DOCULNK_RETENTION_DAYS`: retention policy target for completed documents, default `365`

The API exposes authenticated admin routes `GET/POST /api/templates`, `GET/POST /api/requests`, and `POST /api/requests/{requestId}/revoke`. Public signer routes are `GET /api/public/requests/{requestId}` and `POST /api/public/requests/{requestId}/complete`.

Template creation validates the SHA-256 hash of uploaded PDF bytes before storage. Admin routes use Function authentication, while signer routes enforce expiry, revoke, and completion checks.

When a request is created through the remote API, Azure Communication Services sends the signing invitation directly to the recipient. The sender domain/address must be verified in the ACS resource. Completion notifications are sent to `DOCULNK_ADMIN_EMAIL` when configured.

Signer submission requires an explicit electronic-signature disclosure consent. The consent is sent with remote completion and recorded in the audit event. The application provides an auditable signing workflow, but it does not by itself establish legal compliance for a particular jurisdiction or industry. Configure a scheduled Azure cleanup job using `DOCULNK_RETENTION_DAYS` before production to enforce document deletion.

## Deployment direction

Deploy the Vite output and `api` folder through Azure Static Web Apps. `staticwebapp.config.json` keeps `/sign/*` public for signer links and protects admin API routes with authentication. Replace the browser `localStorage` adapter with API calls when connecting the deployed front end.

For the complete Azure setup, see [DEPLOYMENT.md](DEPLOYMENT.md). It covers Storage, Functions, Static Web Apps Free, Entra ID, ACS Email, environment variables, CORS, monitoring, retention, and end-to-end verification.

This is an MVP signing workflow, not a certificate-backed legal-signature platform. Review applicable e-signature and document-retention requirements before production use.
