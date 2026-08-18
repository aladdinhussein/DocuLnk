import { useState } from 'react'
import type { StoredSubmission } from '../lib/requestStore'
import type { PublishedTemplate } from '../types'
import type { AuthUser } from '../lib/auth'
import { authEnabled } from '../lib/auth'
import { copyText } from '../lib/browser'
import { SubmissionListSkeleton, TemplateTableSkeleton } from '../components/DashboardSkeleton'
import '../styles/admin.css'

type DashboardScreenProps = {
  templates: PublishedTemplate[]
  submissions: StoredSubmission[]
  currentUser: AuthUser | null
  onCreateTemplate: () => void
  onEditTemplate: (template: PublishedTemplate) => void
  onDeleteTemplate: (template: PublishedTemplate) => Promise<void>
  onDownloadSubmission: (submission: StoredSubmission) => void
  onDeleteSubmission: (submission: StoredSubmission) => Promise<void>
  loadState: 'loading' | 'ready' | 'error'
  loadError: string
  onRetryLoad: () => void
  onSignOut: () => void
}

export default function DashboardScreen({
  templates,
  submissions,
  currentUser,
  onCreateTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onDownloadSubmission,
  onDeleteSubmission,
  loadState,
  loadError,
  onRetryLoad,
  onSignOut,
}: DashboardScreenProps) {
  const [templateLinks, setTemplateLinks] = useState<Record<string, string>>({})
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null)
  const [templatePendingDeletion, setTemplatePendingDeletion] = useState<PublishedTemplate | null>(null)
  const [submissionPendingDeletion, setSubmissionPendingDeletion] = useState<StoredSubmission | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const confirmDeleteSubmission = async (submission: StoredSubmission) => {
    setIsDeleting(true)
    setDeleteError('')
    try {
      await onDeleteSubmission(submission)
      setSubmissionPendingDeletion(null)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this submission.')
    } finally {
      setIsDeleting(false)
    }
  }

  /**
   * Closing the dialog is this component's job now that deletion itself lives in
   * the workspace. Without this the confirmation stayed on screen after a
   * successful delete, and a failure gave no feedback at all.
   */
  const confirmDeleteTemplate = async (template: PublishedTemplate) => {
    setIsDeleting(true)
    setDeleteError('')
    try {
      await onDeleteTemplate(template)
      setTemplatePendingDeletion(null)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this template.')
    } finally {
      setIsDeleting(false)
    }
  }

  const generateTemplateFormLink = (template: PublishedTemplate) => {
    const link = `${window.location.origin}/form/${template.templateId}`
    setTemplateLinks((current) => ({ ...current, [template.templateId]: link }))
  }

  const copyTemplateLink = async (templateId: string) => {
    const link = templateLinks[templateId]
    if (!link) {
      return
    }

    if (await copyText(link)) {
      setCopiedTemplateId(templateId)
      window.setTimeout(() => setCopiedTemplateId((current) => current === templateId ? null : current), 1800)
    }
  }
  return (
    <div className="app-shell dashboard-shell">
      <header className="app-header">
        <div className="app-header-top">
          <div className="app-header-identity">
            <h1>Templates</h1>
            <p className="app-header-meta">
              <span>{templates.length} {templates.length === 1 ? 'template' : 'templates'}</span>
              <span className="dot" />
              <span>{submissions.length} signed</span>
            </p>
          </div>
          <div className="app-header-actions">
            {authEnabled && currentUser && (
              <button type="button" className="ghost-button" onClick={() => onSignOut()}>
                Sign out
              </button>
            )}
            <button type="button" className="primary-button" onClick={onCreateTemplate}>
              New template
            </button>
          </div>
        </div>
      </header>

      {loadState === 'error' && (
        <div className="load-banner" data-tone="error">
          <span>{loadError || 'Could not load your templates.'}</span>
          <button type="button" className="secondary-button" onClick={onRetryLoad}>Retry</button>
        </div>
      )}

      {/* While loading we know nothing yet, so we must not claim "no templates". */}
      {loadState === 'loading' && templates.length === 0 ? (
        <TemplateTableSkeleton />
      ) : templates.length === 0 ? (
        <section className="empty-dashboard">
          <span className="empty-kicker">No templates yet</span>
          <h2>Start with a PDF template</h2>
          <p>Configure the fields once, then generate signing links whenever you need them.</p>
          <button type="button" className="secondary-button" onClick={onCreateTemplate}>
            Open template editor
          </button>
        </section>
      ) : (
        <div className="template-table-wrap">
          <table className="template-table">
            <thead>
              <tr>
                <th scope="col">Template</th>
                <th scope="col">Status</th>
                <th scope="col">Fields</th>
                <th scope="col">Public form URL</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => {
                const link = templateLinks[template.templateId]
                return (
                  <tr key={template.templateId}>
                    <th scope="row">
                      <strong>{template.name}</strong>
                      <span className="template-hash">SHA-256 {template.pdfHash.slice(0, 16)}...</span>
                    </th>
                    <td><span className="template-status">Published</span></td>
                    <td>{template.fields.length}</td>
                    <td>
                      {link ? (
                        <div className="table-link-cell">
                          <input readOnly value={link} aria-label={`Public form URL for ${template.name}`} />
                          <button type="button" className="secondary-button" onClick={() => void copyTemplateLink(template.templateId)}>
                            {copiedTemplateId === template.templateId ? 'Copied' : 'Copy link'}
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="secondary-button" onClick={() => generateTemplateFormLink(template)}>
                          Show link
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="template-table-actions">
                        <button type="button" className="secondary-button" onClick={() => onEditTemplate(template)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="quiet-button danger-action"
                          onClick={() => setTemplatePendingDeletion(template)}
                          aria-label={`Delete ${template.name}`}
                          title="Delete template"
                        >
                          <span aria-hidden="true">🗑</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="requests-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Server copies</p>
            <h2>Form submissions</h2>
          </div>
          <span>{submissions.length} total</span>
        </div>
        {loadState === 'loading' && submissions.length === 0 ? (
          <SubmissionListSkeleton />
        ) : submissions.length === 0 ? (
          <div className="requests-empty">Completed forms will appear here.</div>
        ) : (
          <div className="request-list">
            {submissions.map((submission) => {
              const templateName = templates.find(
                (template) => template.templateId === submission.templateId,
              )?.name ?? 'Published template'
              return (
                <article className="request-row" key={submission.submissionId}>
                  <div>
                    <strong>{templateName}</strong>
                    <span className="request-recipient">
                      {submission.signerEmail ?? 'Email not provided'}
                    </span>
                    <span>Created {new Date(submission.createdAt).toLocaleString()}</span>
                  </div>
                  <span
                    className={`request-status status-${submission.emailStatus}`}
                    title={submission.emailError || undefined}
                  >
                    {submission.emailStatus === 'failed' ? 'Email failed' : 'Saved'}
                  </span>
                  <div className="request-row-actions">
                    <button type="button" className="quiet-button" onClick={() => onDownloadSubmission(submission)}>
                      Download signed PDF
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete submission from ${new Date(submission.createdAt).toLocaleDateString()}`}
                      onClick={() => setSubmissionPendingDeletion(submission)}
                    >
                      🗑
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      {templatePendingDeletion && (
        <div className="dialog-backdrop" role="presentation">
          <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-template-title">
            <p className="eyebrow">Delete template</p>
            <h2 id="delete-template-title">Delete “{templatePendingDeletion.name}”?</h2>
            <p>The public form URL will stop working. Existing signed submissions will be kept.</p>
            {deleteError && <p className="dialog-error" role="alert">{deleteError}</p>}
            <div className="confirmation-dialog-actions">
              <button
                type="button"
                className="quiet-button"
                disabled={isDeleting}
                onClick={() => {
                  setTemplatePendingDeletion(null)
                  setDeleteError('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={isDeleting}
                onClick={() => void confirmDeleteTemplate(templatePendingDeletion)}
              >
                {isDeleting ? 'Deleting...' : 'Delete template'}
              </button>
            </div>
          </section>
        </div>
      )}
      {submissionPendingDeletion && (
        <div className="dialog-backdrop" role="presentation">
          <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-submission-title">
            <p className="eyebrow">Delete submission</p>
            <h2 id="delete-submission-title">Delete this signed document?</h2>
            <p>
              The signed PDF is removed permanently. The audit record that it existed and
              was deleted is kept.
            </p>
            {deleteError && <p className="dialog-error" role="alert">{deleteError}</p>}
            <div className="confirmation-dialog-actions">
              <button
                type="button"
                className="quiet-button"
                disabled={isDeleting}
                onClick={() => {
                  setSubmissionPendingDeletion(null)
                  setDeleteError('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={isDeleting}
                onClick={() => void confirmDeleteSubmission(submissionPendingDeletion)}
              >
                {isDeleting ? 'Deleting...' : 'Delete document'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
