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

export type SubmissionRecord = {
  submissionId: string
  templateId: string
  templateHash: string
  createdAt: string
  signedAt?: string
  signerEmail?: string
  signedBlobName?: string
  signedPdfHash?: string
  consentVersion?: string
  consentAcceptedAt?: string
  signerUserAgent?: string
  emailStatus: 'pending' | 'sent' | 'failed'
  emailError?: string
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

