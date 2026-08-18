import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { AuthUser } from '../lib/auth'

const getCurrentUser = vi.fn<() => Promise<AuthUser | null>>()
const login = vi.fn()
const logout = vi.fn()

vi.mock('../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth')>()
  return {
    ...actual,
    // hasAdminRole and adminRole stay real — the role logic is what's under test.
    authEnabled: true,
    getCurrentUser: () => getCurrentUser(),
    login: () => login(),
    logout: () => logout(),
  }
})

const { default: AdminGate } = await import('./AdminGate')

function renderGate() {
  return render(<AdminGate>{(user) => <div>workspace for {user?.userDetails}</div>}</AdminGate>)
}

beforeEach(() => {
  getCurrentUser.mockReset()
  login.mockReset()
  logout.mockReset()
})

afterEach(cleanup)

describe('AdminGate', () => {
  it('asks a signed-out visitor to sign in', async () => {
    getCurrentUser.mockResolvedValue(null)
    renderGate()

    expect(await screen.findByRole('heading', { name: /admin sign-in required/i })).toBeTruthy()
    expect(screen.queryByText(/workspace for/)).toBeNull()
  })

  it('renders the workspace for an account holding the Admin role', async () => {
    getCurrentUser.mockResolvedValue({
      userId: '1', userDetails: 'admin@example.com', userRoles: ['Admin'],
    })
    renderGate()

    expect(await screen.findByText('workspace for admin@example.com')).toBeTruthy()
  })

  it('denies a signed-in account without the Admin role and names it', async () => {
    getCurrentUser.mockResolvedValue({
      userId: '2', userDetails: 'colleague@example.com', userRoles: ['Reader'],
    })
    renderGate()

    expect(await screen.findByRole('heading', { name: /don't have access/i })).toBeTruthy()
    expect(screen.getByText('colleague@example.com')).toBeTruthy()
    // The workspace must not render — every API call would 403.
    expect(screen.queryByText(/workspace for/)).toBeNull()
  })

  it('denies an account with no roles claim at all', async () => {
    getCurrentUser.mockResolvedValue({ userId: '3', userDetails: 'nobody@example.com' })
    renderGate()

    expect(await screen.findByRole('heading', { name: /don't have access/i })).toBeTruthy()
  })

  it('offers a way out of the wrong account', async () => {
    getCurrentUser.mockResolvedValue({ userId: '4', userDetails: 'x@example.com', userRoles: [] })
    renderGate()

    const button = await screen.findByRole('button', { name: /different account/i })
    button.click()

    await waitFor(() => expect(logout).toHaveBeenCalledOnce())
  })

  it('surfaces a sign-in check failure instead of hanging on the spinner', async () => {
    getCurrentUser.mockRejectedValue(new Error('Token endpoint unreachable'))
    renderGate()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/token endpoint unreachable/i)).toBeTruthy()
    expect(screen.queryByText(/checking admin session/i)).toBeNull()
  })
})
