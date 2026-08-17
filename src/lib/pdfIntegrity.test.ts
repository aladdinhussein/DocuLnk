import { describe, expect, it } from 'vitest'
import { computeFileHash, hashMatches } from './pdfIntegrity'

describe('pdfIntegrity', () => {
  it('computes a stable sha256 hash for a file', async () => {
    const file = new File(['hello world'], 'sample.pdf', { type: 'application/pdf' })

    const hash = await computeFileHash(file)

    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('validates that a file hash matches the saved metadata', async () => {
    const file = new File(['hello world'], 'sample.pdf', { type: 'application/pdf' })
    const hash = await computeFileHash(file)

    await expect(hashMatches(file, hash)).resolves.toBe(true)
  })
})
