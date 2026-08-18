import { EmailClient } from '@azure/communication-email'

const connectionString = process.env.DOCULNK_COMMUNICATION_SERVICES_CONNECTION_STRING
const senderAddress = process.env.DOCULNK_EMAIL_SENDER_ADDRESS
function emailClient(): EmailClient {
  if (!connectionString) {
    throw new Error('DOCULNK_COMMUNICATION_SERVICES_CONNECTION_STRING is required')
  }
  return new EmailClient(connectionString)
}

function requireSender(): string {
  if (!senderAddress) {
    throw new Error('DOCULNK_EMAIL_SENDER_ADDRESS is required')
  }
  return senderAddress
}

export async function sendSubmissionToAdmin(input: {
  templateName: string
  submissionId: string
  signerEmail?: string
  pdfBytes: Uint8Array
}): Promise<void> {
  const poller = await emailClient().beginSend({
    senderAddress: requireSender(),
    content: {
      subject: `New submission: ${input.templateName}`,
      plainText: `${input.templateName} received a signed submission. Submission ID: ${input.submissionId}${input.signerEmail ? `\nSigner email: ${input.signerEmail}` : ''}`,
      html: `<p><strong>${escapeHtml(input.templateName)}</strong> received a signed submission.</p><p>Submission ID: ${escapeHtml(input.submissionId)}</p>${input.signerEmail ? `<p>Signer email: ${escapeHtml(input.signerEmail)}</p>` : ''}`,
    },
    recipients: { to: [{ address: requireAdminEmail() }] },
    attachments: [{
      name: `${input.submissionId}-signed.pdf`,
      contentType: 'application/pdf',
      contentInBase64: Buffer.from(input.pdfBytes).toString('base64'),
    }],
  })
  await poller.pollUntilDone()
}

function requireAdminEmail(): string {
  const adminEmail = process.env.DOCULNK_ADMIN_EMAIL
  if (!adminEmail) {
    throw new Error('DOCULNK_ADMIN_EMAIL is required')
  }
  return adminEmail
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character)
}
