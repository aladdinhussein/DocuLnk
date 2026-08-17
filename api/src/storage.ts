import { TableClient, type TableEntity } from '@azure/data-tables'
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'
import type { AuditRecord, SigningRequestRecord, TemplateRecord } from './domain.js'

const connectionString = process.env.DOCULNK_STORAGE_CONNECTION_STRING ?? process.env.AzureWebJobsStorage
const tableName = process.env.DOCULNK_TABLE_NAME ?? 'DocuLnkRecords'
const templateContainerName = process.env.DOCULNK_TEMPLATE_CONTAINER ?? 'templates'
const signedContainerName = process.env.DOCULNK_SIGNED_CONTAINER ?? 'signed-documents'

if (!connectionString) {
  throw new Error('DOCULNK_STORAGE_CONNECTION_STRING or AzureWebJobsStorage is required')
}

const table = TableClient.fromConnectionString(connectionString, tableName)
const blobService = BlobServiceClient.fromConnectionString(connectionString)

async function container(name: string): Promise<ContainerClient> {
  const client = blobService.getContainerClient(name)
  await client.createIfNotExists()
  return client
}

export async function initializeStorage(): Promise<void> {
  await table.createTable()
  await container(templateContainerName)
  await container(signedContainerName)
}

export async function saveTemplate(template: TemplateRecord, pdfBytes: Uint8Array): Promise<void> {
  const blobs = await container(templateContainerName)
  await blobs.getBlockBlobClient(template.pdfBlobName).uploadData(pdfBytes, {
    blobHTTPHeaders: { blobContentType: 'application/pdf' },
  })
  await table.upsertEntity({
    partitionKey: 'template',
    rowKey: template.templateId,
    ...template,
  })
}

export async function updateTemplateMetadata(template: TemplateRecord): Promise<void> {
  await table.upsertEntity({
    partitionKey: 'template',
    rowKey: template.templateId,
    ...template,
  })
}

export async function getTemplate(templateId: string): Promise<TemplateRecord | null> {
  try {
    const entity = await table.getEntity<TableEntity<TemplateRecord>>('template', templateId)
    return entity as unknown as TemplateRecord
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return null
    }
    throw error
  }
}

export async function saveRequest(request: SigningRequestRecord): Promise<void> {
  await table.upsertEntity({
    partitionKey: 'request',
    rowKey: request.requestId,
    ...request,
  })
}

export async function getRequest(requestId: string): Promise<SigningRequestRecord | null> {
  try {
    const entity = await table.getEntity<TableEntity<SigningRequestRecord>>('request', requestId)
    return entity as unknown as SigningRequestRecord
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return null
    }
    throw error
  }
}

export async function deleteRequest(requestId: string): Promise<void> {
  await table.deleteEntity('request', requestId)
}

export async function listTemplates(): Promise<TemplateRecord[]> {
  const records: TemplateRecord[] = []
  for await (const entity of table.listEntities<TableEntity<TemplateRecord>>({
    queryOptions: { filter: "PartitionKey eq 'template'" },
  })) {
    records.push(entity as unknown as TemplateRecord)
  }
  return records
}

export async function listRequests(): Promise<SigningRequestRecord[]> {
  const records: SigningRequestRecord[] = []
  for await (const entity of table.listEntities<TableEntity<SigningRequestRecord>>({
    queryOptions: { filter: "PartitionKey eq 'request'" },
  })) {
    records.push(entity as unknown as SigningRequestRecord)
  }
  return records
}

export async function saveAudit(record: AuditRecord): Promise<void> {
  await table.upsertEntity({
    partitionKey: 'audit',
    rowKey: record.auditId,
    ...record,
  })
}

export async function consumeRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const rowKey = `${key.replace(/[^a-zA-Z0-9-]/g, '_')}-${windowStart}`
  let count = 0
  try {
    const entity = await table.getEntity<TableEntity<{ count: number }>>('rate-limit', rowKey)
    count = Number(entity.count ?? 0)
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 404) throw error
  }
  if (count >= limit) return false
  await table.upsertEntity({
    partitionKey: 'rate-limit',
    rowKey,
    count: count + 1,
    expiresAt: new Date(windowStart + windowMs).toISOString(),
  })
  return true
}

export async function saveSignedDocument(requestId: string, pdfBytes: Uint8Array): Promise<string> {
  const blobName = `${requestId}.pdf`
  const blobs = await container(signedContainerName)
  await blobs.getBlockBlobClient(blobName).uploadData(pdfBytes, {
    blobHTTPHeaders: { blobContentType: 'application/pdf' },
  })
  return blobName
}

export async function getTemplatePdf(template: TemplateRecord): Promise<Uint8Array> {
  const blobs = await container(templateContainerName)
  const response = await blobs.getBlockBlobClient(template.pdfBlobName).download()
  const chunks: Uint8Array[] = []
  for await (const chunk of response.readableStreamBody ?? []) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

export async function getSignedDocument(requestId: string): Promise<Uint8Array | null> {
  const blobs = await container(signedContainerName)
  const client = blobs.getBlockBlobClient(`${requestId}.pdf`)
  if (!(await client.exists())) return null
  const response = await client.download()
  const chunks: Uint8Array[] = []
  for await (const chunk of response.readableStreamBody ?? []) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

export async function deleteSignedDocument(requestId: string): Promise<void> {
  const blobs = await container(signedContainerName)
  await blobs.getBlockBlobClient(`${requestId}.pdf`).deleteIfExists()
}
