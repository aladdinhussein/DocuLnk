export type RequestStatus = 'sent' | 'viewed' | 'completed' | 'expired' | 'revoked'

export type TemplateRecord = {
  templateId: string
  name: string
  pdfHash: string
  hashAlgorithm: 'SHA-256'
  fieldConfig: string
  pdfBlobName: string
  createdAt: string
  publishedAt: string
}

export type SigningRequestRecord = {
  requestId: string
  templateId: string
  templateHash: string
  recipientEmail: string
  status: RequestStatus
  createdAt: string
  expiresAt: string
  viewedAt?: string
  signedAt?: string
  signedBlobName?: string
  signedPdfHash?: string
  consentVersion?: string
  consentAcceptedAt?: string
  signerUserAgent?: string
}

export type AuditRecord = {
  auditId: string
  requestId?: string
  templateId?: string
  action: string
  actor: string
  createdAt: string
  metadata?: string
}

export function isExpired(record: SigningRequestRecord, now = new Date()): boolean {
  return new Date(record.expiresAt) <= now
}
