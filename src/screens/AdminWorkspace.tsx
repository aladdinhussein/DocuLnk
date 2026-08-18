import { useCallback, useEffect, useState } from 'react'
import type { StoredSubmission } from '../lib/requestStore'
import { deleteSubmission as deleteStoredSubmission, listSubmissions } from '../lib/requestStore'
import {
  apiEnabled,
  deleteRemoteSubmission,
  deleteRemoteTemplate,
  downloadRemoteDocument,
  getRemoteTemplate,
  listRemoteSubmissions,
  listRemoteTemplates,
} from '../lib/apiClient'
import { readLocalTemplates, writeLocalTemplates } from '../lib/localTemplates'
import { downloadDataUrl } from '../lib/browser'
import { logout } from '../lib/auth'
import type { AuthUser } from '../lib/auth'
import type { PublishedTemplate } from '../types'
import DashboardScreen from './DashboardScreen'
import EditorScreen from './EditorScreen'
import type { EditorSeed } from './EditorScreen'

type AdminWorkspaceProps = {
  currentUser: AuthUser | null
}

/** Turn a stored template's data URL back into the File the editor works with. */
function templateToFile(template: PublishedTemplate): File {
  const [header, encoded] = template.pdfDataUrl.split(',')
  const mime = header.match(/data:(.*);base64/)?.[1] ?? 'application/pdf'
  const binary = atob(encoded ?? '')
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new File([bytes], template.name, { type: mime })
}

export default function AdminWorkspace({ currentUser }: AdminWorkspaceProps) {
  const [publishedTemplates, setPublishedTemplates] = useState<PublishedTemplate[]>([])
  const [submissions, setSubmissions] = useState<StoredSubmission[]>([])
  const [editorSeed, setEditorSeed] = useState<EditorSeed | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')

  /*
   * The first load right after a sign-in redirect can fail while MSAL is still
   * settling its token cache. Previously this had no `.catch`, so the failure
   * was silent and the only way out was reloading the page. Now it reports the
   * error, retries once on its own, and offers a manual retry.
   */
  const loadWorkspace = useCallback(async () => {
    setLoadState('loading')
    if (!apiEnabled) {
      const savedTemplates = readLocalTemplates()
      if (savedTemplates.length > 0) setPublishedTemplates(savedTemplates)
      setSubmissions(listSubmissions())
      setLoadState('ready')
      return
    }

    try {
      const [templates, savedSubmissions] = await Promise.all([
        listRemoteTemplates(),
        listRemoteSubmissions(),
      ])
      setPublishedTemplates(templates as PublishedTemplate[])
      setSubmissions(savedSubmissions)
      setLoadState('ready')
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load your templates.')
      setLoadState('error')
      throw error
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void loadWorkspace().catch(() => {
      // One automatic retry covers the token becoming available a moment later.
      if (cancelled) return
      window.setTimeout(() => {
        if (!cancelled) void loadWorkspace().catch(() => {})
      }, 1200)
    })

    return () => { cancelled = true }
    // Re-runs when the signed-in identity changes, so a fresh sign-in reloads.
  }, [loadWorkspace, currentUser?.userId])

  const openTemplateEditor = async (template: PublishedTemplate) => {
    // The list endpoint omits the PDF bytes, so fetch the full record first and
    // only then open the editor — matching the original ordering.
    const source = apiEnabled && !template.pdfDataUrl
      ? await getRemoteTemplate(template.templateId) as PublishedTemplate
      : template

    setEditorSeed({ mode: 'edit', template: source, file: templateToFile(source) })
  }

  const deletePublishedTemplate = async (template: PublishedTemplate) => {
    if (apiEnabled) {
      await deleteRemoteTemplate(template.templateId)
    } else {
      writeLocalTemplates(
        readLocalTemplates().filter((item) => item.templateId !== template.templateId),
      )
    }
    setPublishedTemplates((current) => current.filter((item) => item.templateId !== template.templateId))
  }

  const deleteSubmittedForm = async (submission: StoredSubmission) => {
    if (apiEnabled) {
      await deleteRemoteSubmission(submission.submissionId)
    } else {
      deleteStoredSubmission(submission.submissionId)
    }
    setSubmissions((current) => current.filter((item) => item.submissionId !== submission.submissionId))
  }

  const handlePublished = (template: PublishedTemplate) => {
    setPublishedTemplates((current) => [
      ...current.filter((item) => item.templateId !== template.templateId),
      template,
    ])
  }

  const downloadCompletedDocument = (submission: StoredSubmission) => {
    if (apiEnabled) {
      void downloadRemoteDocument(submission.submissionId)
      return
    }
    if (!submission.signedPdfDataUrl) return
    downloadDataUrl(submission.signedPdfDataUrl, `${submission.submissionId}-signed.pdf`)
  }

  if (editorSeed) {
    return (
      <EditorScreen
        seed={editorSeed}
        onClose={() => setEditorSeed(null)}
        onPublished={handlePublished}
      />
    )
  }

  return (
    <DashboardScreen
      templates={publishedTemplates}
      submissions={submissions}
      currentUser={currentUser}
      onCreateTemplate={() => setEditorSeed({ mode: 'new' })}
      onEditTemplate={(template) => void openTemplateEditor(template)}
      onDeleteTemplate={deletePublishedTemplate}
      onDownloadSubmission={downloadCompletedDocument}
      onDeleteSubmission={deleteSubmittedForm}
      loadState={loadState}
      loadError={loadError}
      onRetryLoad={() => void loadWorkspace().catch(() => {})}
      onSignOut={() => void logout()}
    />
  )
}
