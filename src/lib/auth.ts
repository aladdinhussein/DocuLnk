export type AuthUser = {
  userId?: string
  userDetails?: string
  userRoles?: string[]
}

export type AuthState = {
  user: AuthUser | null
  loading: boolean
  enabled: boolean
}

export const authEnabled = Boolean(import.meta.env.VITE_ENABLE_AUTH === 'true')

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!authEnabled) {
    return null
  }

  const response = await fetch('/.auth/me', { credentials: 'include' })
  if (!response.ok) {
    return null
  }

  const payload = await response.json() as { clientPrincipal?: AuthUser }
  return payload.clientPrincipal ?? null
}

export function loginUrl(): string {
  return '/.auth/login/aad?post_login_redirect_uri=/'
}

export function logoutUrl(): string {
  return '/.auth/logout?post_logout_redirect_uri=/'
}
