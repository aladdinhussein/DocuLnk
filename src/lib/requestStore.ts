export type StoredSubmission = {
  submissionId: string
  templateId: string
  templateHash: string
  createdAt: string
  signedAt?: string
  signerEmail?: string
  signedPdfHash?: string
  signedPdfDataUrl?: string
  signedBlobName?: string
  consentVersion?: string
  consentAcceptedAt?: string
  signerUserAgent?: string
  emailStatus: 'pending' | 'sent' | 'failed'
  emailError?: string
  downloadUrl?: string
}

const requestPrefix = 'doculnk-request-'

function requestKey(requestId: string): string {
  return `${requestPrefix}${requestId}`
}

export function saveSubmission(submission: StoredSubmission): void {
  localStorage.setItem(requestKey(submission.submissionId), JSON.stringify(submission))
}

export function getSubmission(submissionId: string): StoredSubmission | null {
  const raw = localStorage.getItem(requestKey(submissionId))
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as StoredSubmission
  } catch {
    return null
  }
}

export function listSubmissions(): StoredSubmission[] {
  const submissions: StoredSubmission[] = []

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(requestPrefix)) {
      continue
    }

    const submissionId = key.slice(requestPrefix.length)
    const submission = getSubmission(submissionId)
    if (submission) {
      submissions.push(submission)
    }
  }

  return submissions.sort((first, second) => second.createdAt.localeCompare(first.createdAt))
}

export function updateSubmission(
  submissionId: string,
  changes: Partial<StoredSubmission>,
): StoredSubmission | null {
  const submission = getSubmission(submissionId)
  if (!submission) {
    return null
  }

  const updatedSubmission = { ...submission, ...changes }
  saveSubmission(updatedSubmission)
  return updatedSubmission
}

export function deleteSubmission(submissionId: string): void {
  localStorage.removeItem(requestKey(submissionId))
}
