import { createHash } from 'node:crypto'
import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions'
import { z } from 'zod'
import { isExpired } from './domain.js'
import { sendCompletionNotification, sendSigningInvitation } from './email.js'
import {
  getRequest,
  getTemplate,
  getTemplatePdf,
  getSignedDocument,
  initializeStorage,
  listRequests,
  listTemplates,
  saveAudit,
  saveRequest,
  saveSignedDocument,
  saveTemplate,
  consumeRateLimit,
  deleteRequest,
  updateTemplateMetadata,
} from './storage.js'

const templateInput = z.object({
  name: z.string().min(1).max(200),
  pdfBase64: z.string().min(1),
  pdfHash: z.string().regex(/^[a-f0-9]{64}$/i),
  fields: z.array(z.record(z.string(), z.unknown())),
})

const requestInput = z.object({
  templateId: z.string().min(1),
  recipientEmail: z.string().email(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
})

const maxPdfBytes = 25 * 1024 * 1024
const adminRoles = new Set(['authenticated', 'admin'])

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

function requireAdmin(request: HttpRequest): HttpResponseInit | null {
  const encoded = request.headers.get('x-ms-client-principal')
  if (!encoded) return json({ error: 'Authentication required' }, 401)
  try {
    const principal = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as { userRoles?: string[] }
    if (!principal.userRoles?.some((role) => adminRoles.has(role))) {
      return json({ error: 'Administrator role required' }, 403)
    }
    return null
  } catch {
    return json({ error: 'Invalid authentication context' }, 401)
  }
}

async function rateLimit(request: HttpRequest, limit = 20): Promise<HttpResponseInit | null> {
  const allowed = await withStorage(() => consumeRateLimit(requestIp(request), limit, 60 * 60 * 1000))
  return allowed ? null : json({ error: 'Too many attempts. Try again later.' }, 429)
}

async function audit(input: { requestId?: string; templateId?: string; action: string; actor: string; metadata?: string }): Promise<void> {
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

app.http('templates-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'templates',
  handler: async (request) => {
    const denied = requireAdmin(request)
    return denied ?? json(await withStorage(listTemplates))
  },
})

app.http('templates-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'templates',
  handler: async (request) => {
    try {
      const denied = requireAdmin(request)
      if (denied) return denied
      const input = templateInput.parse(await readJson(request))
      const pdfBytes = decodePdf(input.pdfBase64)
      const actualHash = createHash('sha256').update(pdfBytes).digest('hex')
      if (actualHash !== input.pdfHash.toLowerCase()) {
        return json({ error: 'PDF hash does not match the uploaded bytes' }, 409)
      }

      const templateId = crypto.randomUUID()
      const template = {
        templateId,
        name: input.name,
        pdfHash: actualHash,
        hashAlgorithm: 'SHA-256' as const,
        fieldConfig: JSON.stringify(input.fields),
        pdfBlobName: `${templateId}.pdf`,
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
      }
      await withStorage(() => saveTemplate(template, pdfBytes))
      return json(template, 201)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid template' }, 400)
    }
  },
})

app.http('templates-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'templates/{templateId}',
  handler: async (request) => {
    const denied = requireAdmin(request)
    if (denied) return denied
    const template = await withStorage(() => getTemplate(request.params.templateId))
    if (!template) return json({ error: 'Template not found' }, 404)
    const pdfBytes = await withStorage(() => getTemplatePdf(template))
    return json({
      ...template,
      fields: JSON.parse(template.fieldConfig),
      pdfDataUrl: `data:application/pdf;base64,${Buffer.from(pdfBytes).toString('base64')}`,
    })
  },
})

app.http('templates-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'templates/{templateId}',
  handler: async (request) => {
    const denied = requireAdmin(request)
    if (denied) return denied
    const template = await withStorage(() => getTemplate(request.params.templateId))
    if (!template) return json({ error: 'Template not found' }, 404)
    const input = z.object({ name: z.string().min(1).max(200), fields: z.array(z.record(z.string(), z.unknown())) }).parse(await readJson(request))
    const updated = { ...template, name: input.name, fieldConfig: JSON.stringify(input.fields), publishedAt: new Date().toISOString() }
    await withStorage(() => updateTemplateMetadata(updated))
    return json(updated)
  },
})

app.http('requests-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'requests',
  handler: async (request) => {
    const denied = requireAdmin(request)
    return denied ?? json(await withStorage(listRequests))
  },
})

app.http('requests-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'requests',
  handler: async (request) => {
    try {
      const denied = requireAdmin(request)
      if (denied) return denied
      const limited = await rateLimit(request)
      if (limited) return limited
      const input = requestInput.parse(await readJson(request))
      const template = await withStorage(() => getTemplate(input.templateId))
      if (!template) {
        return json({ error: 'Template not found' }, 404)
      }

      const requestId = crypto.randomUUID()
      const record = {
        requestId,
        templateId: template.templateId,
        templateHash: template.pdfHash,
        recipientEmail: input.recipientEmail,
        status: 'sent' as const,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + input.expiresInDays * 86400000).toISOString(),
      }
      await withStorage(() => saveRequest(record))
      await sendSigningInvitation({
        recipientEmail: record.recipientEmail,
        templateName: template.name,
        requestId,
        expiresAt: record.expiresAt,
      })
      await audit({ requestId, templateId: template.templateId, action: 'request.created', actor: input.recipientEmail })
      return json(record, 201)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid request' }, 400)
    }
  },
})

app.http('requests-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'public/requests/{requestId}',
  handler: async (request) => {
    const limited = await rateLimit(request)
    if (limited) return limited
    const requestId = request.params.requestId
    const record = await withStorage(() => getRequest(requestId))
    if (!record || isExpired(record) || record.status === 'revoked' || record.status === 'completed') {
      return json({ error: 'Signing request unavailable' }, 404)
    }
    const template = await withStorage(() => getTemplate(record.templateId))
    if (!template || template.pdfHash !== record.templateHash) {
      return json({ error: 'Template integrity check failed' }, 409)
    }
    const viewedRecord = { ...record, status: 'viewed' as const, viewedAt: new Date().toISOString() }
    await withStorage(() => saveRequest(viewedRecord))
    const pdfBytes = await withStorage(() => getTemplatePdf(template))
    await audit({ requestId, templateId: template.templateId, action: 'request.viewed', actor: requestIp(request) })
    return json({
      request: viewedRecord,
      template: {
        templateId: template.templateId,
        name: template.name,
        pdfHash: template.pdfHash,
        hashAlgorithm: template.hashAlgorithm,
        fields: JSON.parse(template.fieldConfig),
        pdfDataUrl: `data:application/pdf;base64,${Buffer.from(pdfBytes).toString('base64')}`,
      },
    })
  },
})

app.http('requests-revoke', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'requests/{requestId}/revoke',
  handler: async (request) => {
    const denied = requireAdmin(request)
    if (denied) return denied
    const requestId = request.params.requestId
    const record = await withStorage(() => getRequest(requestId))
    if (!record) {
      return json({ error: 'Request not found' }, 404)
    }
    const updated = { ...record, status: 'revoked' as const }
    await withStorage(() => saveRequest(updated))
    await audit({ requestId, templateId: record.templateId, action: 'request.revoked', actor: requestIp(request) })
    return json(updated)
  },
})

app.http('requests-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'requests/{requestId}',
  handler: async (request) => {
    const denied = requireAdmin(request)
    if (denied) return denied
    const requestId = request.params.requestId
    const record = await withStorage(() => getRequest(requestId))
    if (!record) return json({ error: 'Request not found' }, 404)
    if (record.status !== 'revoked') return json({ error: 'Only revoked requests can be deleted' }, 409)
    await withStorage(() => deleteRequest(requestId))
    await audit({ requestId, templateId: record.templateId, action: 'request.deleted', actor: requestIp(request) })
    return json({ requestId, deleted: true })
  },
})

app.http('requests-resend', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'requests/{requestId}/resend',
  handler: async (request) => {
    const denied = requireAdmin(request)
    if (denied) return denied
    const record = await withStorage(() => getRequest(request.params.requestId))
    if (!record || record.status === 'completed' || record.status === 'revoked') return json({ error: 'Request cannot be resent' }, 409)
    const template = await withStorage(() => getTemplate(record.templateId))
    if (!template) return json({ error: 'Template not found' }, 404)
    await sendSigningInvitation({ recipientEmail: record.recipientEmail, templateName: template.name, requestId: record.requestId, expiresAt: record.expiresAt })
    await audit({ requestId: record.requestId, templateId: record.templateId, action: 'request.resent', actor: requestIp(request) })
    return json(record)
  },
})

app.http('requests-extend', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'requests/{requestId}/extend',
  handler: async (request) => {
    const denied = requireAdmin(request)
    if (denied) return denied
    const record = await withStorage(() => getRequest(request.params.requestId))
    if (!record || record.status === 'completed' || record.status === 'revoked') return json({ error: 'Request cannot be extended' }, 409)
    const input = z.object({ days: z.number().int().min(1).max(30) }).parse(await readJson(request))
    const updated = { ...record, expiresAt: new Date(Date.now() + input.days * 86400000).toISOString() }
    await withStorage(() => saveRequest(updated))
    await audit({ requestId: record.requestId, templateId: record.templateId, action: 'request.extended', actor: requestIp(request), metadata: `${input.days} days` })
    return json(updated)
  },
})

app.http('signed-download', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'documents/{requestId}',
  handler: async (request) => {
    const denied = requireAdmin(request)
    if (denied) return denied
    const record = await withStorage(() => getRequest(request.params.requestId))
    if (!record || record.status !== 'completed') return json({ error: 'Signed document not found' }, 404)
    const pdfBytes = await withStorage(() => getSignedDocument(request.params.requestId))
    if (!pdfBytes) return json({ error: 'Signed document not found' }, 404)
    return { status: 200, body: Buffer.from(pdfBytes), headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${request.params.requestId}-signed.pdf"` } }
  },
})

app.timer('retention-cleanup', {
  schedule: '0 0 3 * * *',
  handler: async () => {
    const retentionDays = Number(process.env.DOCULNK_RETENTION_DAYS ?? 365)
    const cutoff = Date.now() - retentionDays * 86400000
    const requests = await withStorage(listRequests)
    const { deleteSignedDocument } = await import('./storage.js')
    for (const record of requests) {
      if (record.status === 'completed' && record.signedAt && new Date(record.signedAt).getTime() < cutoff) {
        await withStorage(() => deleteSignedDocument(record.requestId))
        await audit({ requestId: record.requestId, templateId: record.templateId, action: 'document.retention_deleted', actor: 'retention-job', metadata: `retentionDays=${retentionDays}` })
      }
    }
  },
})

app.http('requests-complete', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'public/requests/{requestId}/complete',
  handler: async (request) => {
    try {
      const limited = await rateLimit(request)
      if (limited) return limited
      const requestId = request.params.requestId
      const record = await withStorage(() => getRequest(requestId))
      if (!record || isExpired(record) || record.status === 'revoked' || record.status === 'completed') {
        return json({ error: 'Signing request unavailable' }, 404)
      }
      const body = z.object({
        signedPdfBase64: z.string().min(1),
        consentAccepted: z.literal(true),
        consentVersion: z.string().min(1).max(50),
        consentAcceptedAt: z.string().datetime(),
        signerUserAgent: z.string().max(500).optional(),
      }).parse(await readJson(request))
      const pdfBytes = decodePdf(body.signedPdfBase64)
      const signedPdfHash = createHash('sha256').update(pdfBytes).digest('hex')
      const signedBlobName = await withStorage(() => saveSignedDocument(requestId, pdfBytes))
      const updated = {
        ...record,
        status: 'completed' as const,
        signedAt: new Date().toISOString(),
        signedBlobName,
        signedPdfHash,
        consentVersion: body.consentVersion,
        consentAcceptedAt: body.consentAcceptedAt,
        signerUserAgent: body.signerUserAgent,
      }
      await withStorage(() => saveRequest(updated))
      await audit({
        requestId,
        templateId: record.templateId,
        action: 'request.completed',
        actor: record.recipientEmail,
        metadata: JSON.stringify({
          signedBlobName,
          signedPdfHash,
          consentAccepted: body.consentAccepted,
          consentVersion: body.consentVersion,
          consentAcceptedAt: body.consentAcceptedAt,
          signerUserAgent: body.signerUserAgent,
          signerIp: requestIp(request),
        }),
      })
      const adminEmail = process.env.DOCULNK_ADMIN_EMAIL
      if (adminEmail) {
        await sendCompletionNotification({
          recipientEmail: adminEmail,
          templateName: record.templateId,
          requestId,
        })
      }
      return json(updated)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unable to complete request' }, 400)
    }
  },
})
