import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { adminRole, authEnabled, getCurrentUser, hasAdminRole, login, logout } from '../lib/auth'
import type { AuthUser } from '../lib/auth'
import { TemplateTableSkeleton, WorkspaceHeaderSkeleton } from '../components/DashboardSkeleton'
import '../styles/admin.css'

type AdminGateProps = {
  children: (user: AuthUser | null) => ReactNode
}

export default function AdminGate({ children }: AdminGateProps) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(authEnabled)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (!authEnabled) {
      return
    }

    // Without the catch, a failure here left authLoading true forever and the
    // app sat on "Checking admin session..." with nothing to act on.
    void getCurrentUser()
      .then(setCurrentUser)
      .catch((error: unknown) => {
        setAuthError(error instanceof Error ? error.message : 'Could not check your sign-in.')
      })
      .finally(() => setAuthLoading(false))
  }, [])

  if (authEnabled && authLoading) {
    // Shaped like the dashboard behind it, so signing in does not flash a
    // centred message and then jump to a completely different layout.
    return (
      <div className="app-shell dashboard-shell">
        <WorkspaceHeaderSkeleton />
        <TemplateTableSkeleton rows={2} />
      </div>
    )
  }

  if (authEnabled && !currentUser) {
    return (
      <div className="app-shell centered-message">
        <h1>Admin sign-in required</h1>
        <p>Sign in with Microsoft Entra ID to manage templates and requests.</p>
        {authError && <p className="access-error" role="alert">{authError}</p>}
        <button type="button" className="primary-button auth-button" onClick={() => void login()}>Sign in</button>
      </div>
    )
  }

  /*
   * Signed in, but without the Admin app role. The API would reject every
   * request with 403, so showing the workspace would just look broken. The
   * account is named because the usual cause is being signed in as the wrong
   * one.
   */
  if (authEnabled && !hasAdminRole(currentUser)) {
    return (
      <div className="app-shell centered-message">
        <h1>You don't have access to this workspace</h1>
        <p>
          {currentUser?.userDetails
            ? <>You are signed in as <strong>{currentUser.userDetails}</strong>, which has not been granted the <code>{adminRole}</code> role for DocuLnk.</>
            : <>This account has not been granted the <code>{adminRole}</code> role for DocuLnk.</>}
        </p>
        <p className="access-hint">
          Ask an administrator to assign the role, or sign in with an account that has it.
        </p>
        <div className="access-actions">
          <button type="button" className="secondary-button" onClick={() => void logout()}>
            Sign in with a different account
          </button>
        </div>
      </div>
    )
  }

  return <>{children(currentUser)}</>
}
