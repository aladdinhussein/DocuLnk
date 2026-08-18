export type Route =
  | { kind: 'signer'; templateId: string }
  | { kind: 'admin' }

/**
 * Resolved once at module load, matching the original behaviour. The app has no
 * in-app navigation between the admin and signer surfaces — a signer arrives on
 * a deep link and stays there — so there is nothing for a router to do. The
 * Static Web Apps navigation fallback serves index.html for /form/*.
 */
export function resolveRoute(pathname: string): Route {
  if (!pathname.startsWith('/form/')) {
    return { kind: 'admin' }
  }

  const templateId = pathname.split('/').filter(Boolean).pop() ?? ''
  return templateId ? { kind: 'signer', templateId } : { kind: 'admin' }
}

export function useRoute(): Route {
  return resolveRoute(window.location.pathname)
}
