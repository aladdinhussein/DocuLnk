export async function computeFileHash(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  const hashArray = Array.from(new Uint8Array(hashBuffer))

  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashMatches(file: File, expectedHash: string): Promise<boolean> {
  const incomingHash = await computeFileHash(file)
  return incomingHash === expectedHash.toLowerCase()
}
