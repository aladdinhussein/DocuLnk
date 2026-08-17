import { EmailClient } from '@azure/communication-email'

const connectionString = process.env.DOCULNK_COMMUNICATION_SERVICES_CONNECTION_STRING
const senderAddress = process.env.DOCULNK_EMAIL_SENDER_ADDRESS
const publicBaseUrl = process.env.DOCULNK_PUBLIC_BASE_URL ?? ''

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

export async function sendSigningInvitation(input: {
  recipientEmail: string
  templateName: string
  requestId: string
  expiresAt: string
}): Promise<void> {
  const link = `${publicBaseUrl.replace(/\/$/, '')}/sign/${input.requestId}`
  const poller = await emailClient().beginSend({
    senderAddress: requireSender(),
    content: {
      subject: `Signature requested: ${input.templateName}`,
      plainText: `You have been asked to sign ${input.templateName}. Open this link to review and sign: ${link}\n\nThis link expires on ${new Date(input.expiresAt).toLocaleDateString()}.`,
      html: `<p>You have been asked to sign <strong>${escapeHtml(input.templateName)}</strong>.</p><p><a href="${link}">Review and sign the document</a></p><p>This link expires on ${new Date(input.expiresAt).toLocaleDateString()}.</p>`,
    },
    recipients: { to: [{ address: input.recipientEmail }] },
  })
  await poller.pollUntilDone()
}

export async function sendCompletionNotification(input: {
  recipientEmail: string
  templateName: string
  requestId: string
}): Promise<void> {
  const poller = await emailClient().beginSend({
    senderAddress: requireSender(),
    content: {
      subject: `Document signed: ${input.templateName}`,
      plainText: `${input.templateName} has been signed. Request ID: ${input.requestId}`,
      html: `<p><strong>${escapeHtml(input.templateName)}</strong> has been signed.</p><p>Request ID: ${escapeHtml(input.requestId)}</p>`,
    },
    recipients: { to: [{ address: input.recipientEmail }] },
  })
  await poller.pollUntilDone()
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
