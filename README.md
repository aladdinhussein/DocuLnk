# DocuLnk

DocuLnk is a PDF template and document-signing application. The front end is a React/Vite app and the production API is designed for Azure Functions, Azure Blob Storage, and Azure Table Storage.

## Current features

- Multi-page PDF template preview
- Drag and resize template fields
- Text, date, checkbox, initials, and signature fields
- Typed or drawn signatures
- Zoom and next-field signer navigation
- Signed PDF download
- Published form dashboard with stable public URLs
- Submission archive with signed-PDF fallback downloads
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
- `DOCULNK_COMMUNICATION_SERVICES_CONNECTION_STRING`: Azure Communication Services resource connection string
- `DOCULNK_EMAIL_SENDER_ADDRESS`: verified ACS sender address, for example `donotreply@your-verified-domain`
- `DOCULNK_ADMIN_EMAIL`: comma-separated addresses notified after a document is completed, for example `admin@example.com,Livoniafsctreasurer@gmail.com`
- `DOCULNK_RETENTION_DAYS`: retention policy target for completed documents, default `365`

The API exposes authenticated admin routes for templates and submissions: `GET/POST/DELETE /api/templates`, `GET /api/submissions`, and `GET /api/submissions/{submissionId}/document`. Public form routes are `GET /api/public/forms/{templateId}`, `POST /api/public/forms/{templateId}/submissions`, and `GET /api/public/submissions/{submissionId}/document`.

Template creation validates the SHA-256 hash of uploaded PDF bytes before storage. Admin routes use Function authentication. Published forms are stable URLs that can be completed repeatedly by anyone with the link.

Each completed form is saved to Blob Storage before Azure Communication Services attempts delivery. The signed PDF is attached to an email sent to every address in the comma-separated `DOCULNK_ADMIN_EMAIL` setting; if delivery fails, the submission remains available through the authenticated admin archive and the public download returned to the signer. The sender domain/address must be verified in the ACS resource.

Signer submission requires an explicit electronic-signature disclosure consent. The consent is sent with remote completion and recorded in the audit event. The application provides an auditable signing workflow, but it does not by itself establish legal compliance for a particular jurisdiction or industry. Configure a scheduled Azure cleanup job using `DOCULNK_RETENTION_DAYS` before production to enforce document deletion.

## Deployment direction

Deploy the Vite output and `api` folder through Azure Static Web Apps. `staticwebapp.config.json` keeps `/form/*` and public form API routes available anonymously while protecting admin API routes with authentication.

For the complete Azure setup, see [DEPLOYMENT.md](DEPLOYMENT.md). It covers Storage, Functions, Static Web Apps Free, Entra ID, ACS Email, environment variables, CORS, monitoring, retention, and end-to-end verification.

This is an MVP signing workflow, not a certificate-backed legal-signature platform. Review applicable e-signature and document-retention requirements before production use.
