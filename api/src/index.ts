import { createHash } from 'node:crypto'
import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'
import { sendSubmissionToAdmin } from './email.js'
import type { SubmissionRecord } from './domain.js'
import {
  consumeRateLimit,
  deleteTemplate,
  deleteSignedDocument,
  deleteSubmission,
  getSignedDocument,
  getSubmission,
  getTemplate,
  getTemplatePdf,
  initializeStorage,
  listSubmissions,
  listTemplates,
  saveAudit,
  saveSignedDocument,
  saveSubmission,
  saveTemplate,
  updateTemplateMetadata,
} from './storage.js'

const templateInput = z.object({
  name: z.string().min(1).max(200),
  pdfBase64: z.string().min(1),
  pdfHash: z.string().regex(/^[a-f0-9]{64}$/i),
  fields: z.array(z.record(z.string(), z.unknown())),
})

const submissionInput = z.object({
  signedPdfBase64: z.string().min(1),
  signerEmail: z.string().email().optional(),
  consentAccepted: z.literal(true),
  consentVersion: z.string().min(1).max(50),
  consentAcceptedAt: z.string().datetime(),
  signerUserAgent: z.string().max(500).optional(),
})

const maxPdfBytes = 25 * 1024 * 1024
const adminRoleValue = 'Admin'
const aadTenantId = process.env.DOCULNK_AAD_TENANT_ID ?? ''
const aadClientId = process.env.DOCULNK_AAD_CLIENT_ID ?? ''
const aadJwks = aadTenantId
  ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${aadTenantId}/discovery/v2.0/keys`))
  : null

function decodePdf(value: string): Buffer {
  const bytes = Buffer.from(value, 'base64')
  if (bytes.length === 0 || bytes.length > maxPdfBytes || bytes.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('PDF must be valid and smaller than 25 MB')
  }
  return bytes
}

function requestIp(request: HttpRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

async function requireAdmin(request: HttpRequest): Promise<HttpResponseInit | null> {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
  if (!token || !aadJwks || !aadTenantId || !aadClientId) {
    return json({ error: 'Authentication required' }, 401)
  }
  try {
    const { payload } = await jwtVerify(token, aadJwks, {
      issuer: `https://login.microsoftonline.com/${aadTenantId}/v2.0`,
      audience: [aadClientId, `api://${aadClientId}`],
    })
    const roles = Array.isArray(payload.roles) ? (payload.roles as string[]) : []
    if (!roles.includes(adminRoleValue)) {
      return json({ error: 'Administrator role required' }, 403)
    }
    return null
  } catch {
    return json({ error: 'Invalid or expired token' }, 401)
  }
}

async function rateLimit(request: HttpRequest, limit = 20): Promise<HttpResponseInit | null> {
  const allowed = await withStorage(() => consumeRateLimit(requestIp(request), limit, 60 * 60 * 1000))
  return allowed ? null : json({ error: 'Too many attempts. Try again later.' }, 429)
}

async function audit(input: { submissionId?: string; templateId?: string; action: string; actor: string; metadata?: string }): Promise<void> {
  await withStorage(() => saveAudit({
    auditId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  }))
}

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: {
      'content-type': 'application/json',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
    },
  }
}

async function readJson(request: HttpRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new Error('Request body must be valid JSON')
  }
}

async function withStorage<T>(action: () => Promise<T>): Promise<T> {
  await initializeStorage()
  return action()
}

async function templatePayload(templateId: string) {
  const template = await withStorage(() => getTemplate(templateId))
  if (!template) return null
  const pdfBytes = await withStorage(() => getTemplatePdf(template))
  return {
    templateId: template.templateId,
    name: template.name,
    pdfHash: template.pdfHash,
    hashAlgorithm: template.hashAlgorithm,
    fields: JSON.parse(template.fieldConfig),
    pdfDataUrl: `data:application/pdf;base64,${Buffer.from(pdfBytes).toString('base64')}`,
  }
}

app.http('templates-list', {
  methods: ['GET'], authLevel: 'anonymous', route: 'templates',
  handler: async (request) => {
    const denied = await requireAdmin(request)
    return denied ?? json(await withStorage(listTemplates))
  },
})

app.http('templates-create', {
  methods: ['POST'], authLevel: 'anonymous', route: 'templates',
  handler: async (request) => {
    try {
      const denied = await requireAdmin(request)
      if (denied) return denied
      const input = templateInput.parse(await readJson(request))
      const pdfBytes = decodePdf(input.pdfBase64)
      const actualHash = createHash('sha256').update(pdfBytes).digest('hex')
      if (actualHash !== input.pdfHash.toLowerCase()) return json({ error: 'PDF hash does not match the uploaded bytes' }, 409)
      const templateId = crypto.randomUUID()
      const template = {
        templateId, name: input.name, pdfHash: actualHash, hashAlgorithm: 'SHA-256' as const,
        fieldConfig: JSON.stringify(input.fields), pdfBlobName: `${templateId}.pdf`,
        createdAt: new Date().toISOString(), publishedAt: new Date().toISOString(),
      }
      await withStorage(() => saveTemplate(template, pdfBytes))
      return json(template, 201)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid template' }, 400)
    }
  },
})

app.http('templates-get', {
  methods: ['GET'], authLevel: 'anonymous', route: 'templates/{templateId}',
  handler: async (request) => {
    const denied = await requireAdmin(request)
    if (denied) return denied
    const payload = await templatePayload(request.params.templateId)
    return payload ? json(payload) : json({ error: 'Template not found' }, 404)
  },
})

const templateUpdateInput = z.object({
  name: z.string().min(1).max(200),
  fields: z.array(z.record(z.string(), z.unknown())),
  pdfBase64: z.string().min(1).optional(),
  pdfHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
})

app.http('templates-update', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'templates/{templateId}',
  handler: async (request) => {
    try {
      const denied = await requireAdmin(request)
      if (denied) return denied
      const template = await withStorage(() => getTemplate(request.params.templateId))
      if (!template) return json({ error: 'Template not found' }, 404)
      const input = templateUpdateInput.parse(await readJson(request))

      if (input.pdfBase64) {
        if (!input.pdfHash) return json({ error: 'pdfHash is required when replacing the PDF' }, 400)
        const pdfBytes = decodePdf(input.pdfBase64)
        const actualHash = createHash('sha256').update(pdfBytes).digest('hex')
        if (actualHash !== input.pdfHash.toLowerCase()) return json({ error: 'PDF hash does not match the uploaded bytes' }, 409)
        // Same templateId and blob name, so this overwrites the existing record and file
        // in place instead of creating a new template with its own URL.
        const updated = {
          ...template, name: input.name, pdfHash: actualHash, hashAlgorithm: 'SHA-256' as const,
          fieldConfig: JSON.stringify(input.fields), publishedAt: new Date().toISOString(),
        }
        await withStorage(() => saveTemplate(updated, pdfBytes))
        return json(updated)
      }

      const updated = { ...template, name: input.name, fieldConfig: JSON.stringify(input.fields), publishedAt: new Date().toISOString() }
      await withStorage(() => updateTemplateMetadata(updated))
      return json(updated)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid update' }, 400)
    }
  },
})

app.http('templates-delete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'templates/{templateId}',
  handler: async (request) => {
    const denied = await requireAdmin(request)
    if (denied) return denied
    const template = await withStorage(() => getTemplate(request.params.templateId))
    if (!template) return json({ error: 'Template not found' }, 404)
    await withStorage(() => deleteTemplate(template))
    await audit({ templateId: template.templateId, action: 'template.deleted', actor: requestIp(request) })
    return json({ templateId: template.templateId, deleted: true })
  },
})

app.http('public-form-get', {
  methods: ['GET'], authLevel: 'anonymous', route: 'public/forms/{templateId}',
  handler: async (request) => {
    const limited = await rateLimit(request)
    if (limited) return limited
    const payload = await templatePayload(request.params.templateId)
    return payload ? json(payload) : json({ error: 'Form not found' }, 404)
  },
})

app.http('public-form-submit', {
  methods: ['POST'], authLevel: 'anonymous', route: 'public/forms/{templateId}/submissions',
  handler: async (request) => {
    try {
      const limited = await rateLimit(request)
      if (limited) return limited
      const template = await withStorage(() => getTemplate(request.params.templateId))
      if (!template) return json({ error: 'Form not found' }, 404)
      const input = submissionInput.parse(await readJson(request))
      const pdfBytes = decodePdf(input.signedPdfBase64)
      const submissionId = crypto.randomUUID()
      const signedPdfHash = createHash('sha256').update(pdfBytes).digest('hex')
      const signedBlobName = await withStorage(() => saveSignedDocument(submissionId, pdfBytes))
      const createdAt = new Date().toISOString()
      let submission: SubmissionRecord = {
        submissionId, templateId: template.templateId, templateHash: template.pdfHash, createdAt,
        signedAt: createdAt, signerEmail: input.signerEmail, signedBlobName, signedPdfHash,
        consentVersion: input.consentVersion, consentAcceptedAt: input.consentAcceptedAt,
        signerUserAgent: input.signerUserAgent, emailStatus: 'pending',
      }
      await withStorage(() => saveSubmission(submission))
      await audit({ submissionId, templateId: template.templateId, action: 'submission.created', actor: requestIp(request), metadata: JSON.stringify({ signedPdfHash, consentVersion: input.consentVersion }) })
      try {
        await sendSubmissionToAdmin({ templateName: template.name, submissionId, signerEmail: input.signerEmail, pdfBytes })
        submission = { ...submission, emailStatus: 'sent', emailError: undefined }
      } catch (error) {
        submission = { ...submission, emailStatus: 'failed', emailError: error instanceof Error ? error.message : 'Email delivery failed' }
      }
      await withStorage(() => saveSubmission(submission))
      await audit({ submissionId, templateId: template.templateId, action: `submission.email_${submission.emailStatus}`, actor: 'system', metadata: submission.emailError })
      return json({ ...submission, downloadUrl: `/api/public/submissions/${submissionId}/document` }, 201)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unable to save submission' }, 400)
    }
  },
})

app.http('submissions-list', {
  methods: ['GET'], authLevel: 'anonymous', route: 'submissions',
  handler: async (request) => {
    const denied = await requireAdmin(request)
    return denied ?? json(await withStorage(listSubmissions))
  },
})

async function downloadSubmission(submissionId: string): Promise<HttpResponseInit> {
  const submission = await withStorage(() => getSubmission(submissionId))
  if (!submission) return json({ error: 'Submission not found' }, 404)
  const pdfBytes = await withStorage(() => getSignedDocument(submissionId))
  if (!pdfBytes) return json({ error: 'Signed document not found' }, 404)
  return { status: 200, body: Buffer.from(pdfBytes), headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${submissionId}-signed.pdf"` } }
}

app.http('public-submission-download', {
  methods: ['GET'], authLevel: 'anonymous', route: 'public/submissions/{submissionId}/document',
  handler: async (request) => downloadSubmission(request.params.submissionId),
})

app.http('submissions-delete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'submissions/{submissionId}',
  handler: async (request, context) => {
    const denied = await requireAdmin(request)
    if (denied) return denied
    try {
      const submission = await withStorage(() => getSubmission(request.params.submissionId))
      if (!submission) return json({ error: 'Submission not found' }, 404)
      await withStorage(() => deleteSubmission(submission.submissionId))
      // The audit row outlives the document on purpose: the record that a
      // submission existed and was deleted is what makes the trail meaningful.
      await audit({
        submissionId: submission.submissionId,
        templateId: submission.templateId,
        action: 'submission.deleted',
        actor: requestIp(request),
        metadata: JSON.stringify({ signedPdfHash: submission.signedPdfHash, signedAt: submission.signedAt }),
      })
      return json({ submissionId: submission.submissionId, deleted: true })
    } catch (error) {
      context.error('submission delete failed', error)
      return json({ error: error instanceof Error ? error.message : 'Unable to delete this submission' }, 500)
    }
  },
})

app.http('admin-submission-download', {
  methods: ['GET'], authLevel: 'anonymous', route: 'submissions/{submissionId}/document',
  handler: async (request) => {
    const denied = await requireAdmin(request)
    return denied ?? downloadSubmission(request.params.submissionId)
  },
})

app.timer('retention-cleanup', {
  schedule: '0 0 3 * * *',
  handler: async () => {
    const retentionDays = Number(process.env.DOCULNK_RETENTION_DAYS ?? 365)
    const cutoff = Date.now() - retentionDays * 86400000
    const submissions = await withStorage(listSubmissions)
    for (const submission of submissions) {
      if (submission.signedAt && new Date(submission.signedAt).getTime() < cutoff) {
        await withStorage(() => deleteSignedDocument(submission.submissionId))
        await audit({ submissionId: submission.submissionId, templateId: submission.templateId, action: 'document.retention_deleted', actor: 'retention-job', metadata: `retentionDays=${retentionDays}` })
      }
    }
  },
})
