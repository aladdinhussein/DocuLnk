import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser'

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

export class AuthRequiredError extends Error {
  constructor(message = 'Sign-in is required to continue.') {
    super(message)
    this.name = 'AuthRequiredError'
  }
}

export const authEnabled = (import.meta.env.VITE_ENABLE_AUTH as string | undefined)?.trim().toLowerCase() === 'true'

/** Must match adminRoleValue in api/src/index.ts. */
export const adminRole = 'Admin'

/**
 * Whether the signed-in account holds the Admin app role.
 *
 * Advisory only — the API independently verifies the role on every request and
 * is the actual enforcement point. This exists so an account without the role
 * gets told so, instead of a working-looking dashboard that 403s on every call.
 *
 * Entra omits the `roles` claim entirely when a user has no assignment, so an
 * absent claim and an unassigned user are the same case.
 */
export function hasAdminRole(user: AuthUser | null): boolean {
  return Boolean(user?.userRoles?.includes(adminRole))
}

const clientId = import.meta.env.VITE_AAD_CLIENT_ID as string | undefined
const tenantId = import.meta.env.VITE_AAD_TENANT_ID as string | undefined
const apiScope = clientId ? `api://${clientId}/access_as_user` : ''

if (authEnabled && (!clientId || !tenantId)) {
  // MSAL stays null below, so admin calls would silently go out unauthenticated and 401.
  console.error('Auth is enabled but VITE_AAD_CLIENT_ID/VITE_AAD_TENANT_ID are missing. Admin API calls will fail with 401.')
}

const msalInstance = authEnabled && clientId && tenantId
  ? new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
    })
  : null

let initialization: Promise<void> | null = null

async function ensureInitialized(): Promise<void> {
  if (!msalInstance) return
  if (!initialization) {
    initialization = msalInstance.initialize().then(async () => {
      const result = await msalInstance.handleRedirectPromise()
      if (result?.account) {
        msalInstance.setActiveAccount(result.account)
      }
    })
  }
  await initialization
}

function accountToUser(account: AccountInfo): AuthUser {
  const roles = (account.idTokenClaims?.roles as string[] | undefined) ?? []
  return {
    userId: account.homeAccountId,
    userDetails: account.username,
    userRoles: roles,
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!authEnabled || !msalInstance) {
    return null
  }
  await ensureInitialized()
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null
  if (!account) return null
  msalInstance.setActiveAccount(account)
  return accountToUser(account)
}

export async function login(): Promise<void> {
  if (!msalInstance) return
  await ensureInitialized()
  await msalInstance.loginRedirect({ scopes: [apiScope] })
}

export async function logout(): Promise<void> {
  if (!msalInstance) return
  await ensureInitialized()
  await msalInstance.logoutRedirect()
}

// Returns null when signed out, which callers treat as an anonymous request — the public
// signer routes rely on that. Throws when an account exists but its token cannot be
// renewed silently, so callers abort instead of firing a request that is certain to 401.
export async function getAccessToken(): Promise<string | null> {
  if (!authEnabled || !msalInstance) return null
  await ensureInitialized()
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0]
  if (!account) return null
  try {
    const result = await msalInstance.acquireTokenSilent({ scopes: [apiScope], account })
    return result.accessToken
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      // Navigates away; the rejection stops the caller from racing the redirect.
      void msalInstance.acquireTokenRedirect({ scopes: [apiScope], account })
      throw new AuthRequiredError('Your session expired. Redirecting you to sign in again.')
    }
    throw error
  }
}
