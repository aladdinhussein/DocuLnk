import { describe, expect, it } from 'vitest'
import { adminRole, hasAdminRole } from './auth'
import type { AuthUser } from './auth'

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return { userId: 'abc', userDetails: 'admin@example.com', ...overrides }
}

describe('hasAdminRole', () => {
  it('accepts an account holding the Admin role', () => {
    expect(hasAdminRole(user({ userRoles: [adminRole] }))).toBe(true)
  })

  it('accepts when Admin sits alongside other roles', () => {
    expect(hasAdminRole(user({ userRoles: ['Reader', adminRole] }))).toBe(true)
  })

  it('rejects an account with other roles only', () => {
    expect(hasAdminRole(user({ userRoles: ['Reader'] }))).toBe(false)
  })

  it('rejects an empty role list', () => {
    expect(hasAdminRole(user({ userRoles: [] }))).toBe(false)
  })

  it('rejects an absent roles claim', () => {
    // Entra omits `roles` entirely for an unassigned user, so this is the
    // same case as having no role rather than an unknown one.
    expect(hasAdminRole(user())).toBe(false)
  })

  it('rejects a signed-out session', () => {
    expect(hasAdminRole(null)).toBe(false)
  })

  it('is case-sensitive, matching the API check', () => {
    expect(hasAdminRole(user({ userRoles: ['admin'] }))).toBe(false)
  })
})

describe('adminRole', () => {
  it('matches the value the API enforces', () => {
    // api/src/index.ts: const adminRoleValue = 'Admin'
    expect(adminRole).toBe('Admin')
  })
})
