import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import type { StoredSubmission } from '../lib/requestStore'
import { saveSubmission } from '../lib/requestStore'
import { apiEnabled, completeRemoteSubmission, downloadRemoteDocument } from '../lib/apiClient'
import { readBlobAsDataUrl } from '../lib/browser'
import { flattenSignedPdf } from '../lib/flattenSignedPdf'
import {
  BASE_PAGE_WIDTH,
  MIN_COMFORTABLE_FIELD_PX,
  usableFitZoom,
  zoomForFieldHeight,
} from '../pdf/fieldGeometry'
import { usePdfSource, useVisiblePage, scrollToPage } from '../pdf/usePdfDocument'
import { useFitOnMount, useZoom } from '../pdf/useZoom'
import type { TemplateField } from '../types'
import AdoptSignatureDialog from '../signer/AdoptSignatureDialog'
import type { AdoptedSignature } from '../signer/AdoptSignatureDialog'
import CompletionScreen from '../signer/CompletionScreen'
import ConsentGate from '../signer/ConsentGate'
import FinishBar from '../signer/FinishBar'
import NextFieldChip from '../signer/NextFieldChip'
import SignerField from '../signer/SignerField'
import { SignerLoading, SignerUnavailable } from '../signer/SignerStatus'
import { DocumentSkeleton } from '../components/DashboardSkeleton'
import FieldBookmarks from '../signer/FieldBookmarks'
import FieldLegend from '../signer/FieldLegend'
import { BOOKMARK_RAIL_PX, planBookmarks } from '../signer/fieldTagLayout'
import { useSignerSession } from '../signer/useSignerSession'
import type { Notice } from '../signer/notice'
import { TRANSIENT_NOTICE_MS } from '../signer/notice'
import {
  applicabilityDelta,
  applicabilityNotice,
  applySignerValue,
  controllerOf,
  expandToGroups,
  incompleteRequiredFields,
  isEffectivelyRequired,
  isFieldApplicable,
  isFieldFilled,
  nextUnfilledField,
  signerProgress,
  sortSignerFields,
  todayAsInputValue,
  walkerLabel,
} from '../signer/signerFieldModel'
import '../styles/signer.css'

export const consentVersion = '2026-08-16-v1'
const supportEmail = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) ?? ''

type SignerScreenProps = {
  templateId: string
}

export default function SignerScreen({ templateId }: SignerScreenProps) {
  const { session, retry } = useSignerSession(templateId)
  const template = session.status === 'ready' ? session.template : null

  const [signerValues, setSignerValues] = useState<Record<string, string>>({})
  const [signerEmail, setSignerEmail] = useState('')
  const [activeFieldId, setActiveFieldId] = useState('')
  const [flaggedFieldIds, setInvalidFieldIds] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<Notice>(null)
  const [started, setStarted] = useState(false)
  const visitedRef = useRef<Set<string>>(new Set())

  const [adopted, setAdopted] = useState<AdoptedSignature | null>(null)
  const [adoptOpen, setAdoptOpen] = useState(false)
  const pendingSignatureFieldRef = useRef<string | null>(null)

  const [consentAccepted, setConsentAccepted] = useState(false)
  const [consentAcceptedAt, setConsentAcceptedAt] = useState('')
  const [consentDismissed, setConsentDismissed] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completed, setCompleted] = useState<StoredSubmission | null>(null)
  const [signedBlob, setSignedBlob] = useState<Blob | null>(null)

  const [pageCount, setPageCount] = useState(0)
  const [pdfError, setPdfError] = useState('')
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLButtonElement | null>>({})
  const finishRef = useRef<HTMLButtonElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)

  const { zoom, setZoom, zoomIn, zoomOut, resetZoom } = useZoom({ min: 0.5, max: 2.5 })

  const pdfSource = usePdfSource(template?.pdfDataUrl)
  const visiblePage = useVisiblePage(pageCount)

  const fields = useMemo(() => (template ? sortSignerFields(template.fields) : []), [template])
  const progress = signerProgress(fields, signerValues)
  const locked = isSubmitting || Boolean(completed)

  // A flag only shows while the field is still genuinely missing. Unticking a
  // controlling checkbox makes its dependents optional, and choosing one option
  // satisfies its whole group, so flags on those fields must fall away without
  // the signer having to touch each one.
  const invalidFieldIds = useMemo(() => {
    if (flaggedFieldIds.size === 0) return flaggedFieldIds
    const missing = new Set(incompleteRequiredFields(fields, signerValues).map((field) => field.id))
    return expandToGroups(new Set([...flaggedFieldIds].filter((id) => missing.has(id))), fields)
  }, [flaggedFieldIds, fields, signerValues])

  // One bookmark per row of fields, planned across the whole page. A field
  // whose controlling checkbox is unticked is not part of the form right now,
  // so it gets no bookmark and cannot be jumped to.
  const bookmarks = useMemo(
    () => planBookmarks(
      fields.filter((field) => isFieldApplicable(field, fields, signerValues)),
      signerValues,
      activeFieldId,
      invalidFieldIds,
    ),
    [fields, signerValues, activeFieldId, invalidFieldIds],
  )

  /** Fit the page, but never so small that the shortest field becomes unusable. */
  const fitToUsableWidth = useCallback((container: HTMLElement | null) => {
    if (!container) return
    // The rail only occupies width beside the page on wide screens; under
    // 640px it becomes a strip above the page, and reserving for it here
    // would cost a phone a quarter of its usable page width.
    const railBesidePage = !window.matchMedia('(max-width: 640px)').matches
    const available = container.clientWidth - 32 - (railBesidePage ? BOOKMARK_RAIL_PX : 0)
    if (available <= 0) return
    const fit = available / BASE_PAGE_WIDTH
    setZoom(Math.min(2.5, Math.max(0.5, Number(usableFitZoom(fit, fields).toFixed(2)))))
  }, [fields, setZoom])

  useFitOnMount(stageRef, fitToUsableWidth, Boolean(template))

  // Release the object URL only when the screen goes away, not immediately
  // after the download click, which used to race the browser's save.
  const objectUrlRef = useRef<string>('')
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
  }, [])

  const setFieldValue = useCallback((fieldId: string, value: string) => {
    setSignerValues(
      (current) => applySignerValue(fields, current, fieldId, value) as Record<string, string>,
    )
    setInvalidFieldIds((current) => {
      if (!current.has(fieldId)) return current
      const next = new Set(current)
      next.delete(fieldId)
      return next
    })
  }, [fields])

  // Ticking a controlling checkbox makes grey boxes wake up somewhere on the
  // page, possibly off screen. Say so. This is a diff of committed state rather
  // than logic inside the updater, which StrictMode runs twice.
  const previousValuesRef = useRef(signerValues)
  useEffect(() => {
    const text = applicabilityNotice(applicabilityDelta(fields, previousValuesRef.current, signerValues))
    previousValuesRef.current = signerValues
    if (text) setNotice({ tone: 'info', text, transient: true })
  }, [fields, signerValues])

  useEffect(() => {
    if (!notice?.transient) return
    const timer = window.setTimeout(() => {
      setNotice((current) => (current?.transient ? null : current))
    }, TRANSIENT_NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  /**
   * Bring a field up to a comfortable size before focusing it.
   *
   * Field boxes scale with the page, so on a dense form at fit-to-width they can
   * render around 10px tall — too small to tap or read. Enlarging hit areas
   * instead would just make neighbours overlap, so zoom is the only lever that
   * actually creates room.
   */
  const focusField = useCallback((field: TemplateField) => {
    setActiveFieldId(field.id)

    setZoom((current) => {
      if (field.height * current >= MIN_COMFORTABLE_FIELD_PX) return current
      return Math.min(2.5, zoomForFieldHeight(field.height, MIN_COMFORTABLE_FIELD_PX))
    })

    // Wait for the zoom-driven re-layout before scrolling, or the field has
    // moved by the time the scroll lands.
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => {
      const element = fieldRefs.current[field.id]
      element?.focus()
      element?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' })
    }, 0)
  }, [setZoom])

  /** Fill a field the moment it is reached, where the value is knowable. */
  const autoFillOnReach = useCallback((field: TemplateField) => {
    if (isFieldFilled(field, signerValues[field.id])) return
    if (field.type === 'date') {
      setFieldValue(field.id, todayAsInputValue())
      return
    }
    if (field.type === 'signature' && adopted) {
      setFieldValue(field.id, adopted.signaturePng)
      return
    }
    if (field.type === 'initials' && adopted) {
      setFieldValue(field.id, adopted.initialsPng)
    }
  }, [adopted, signerValues, setFieldValue])

  const goToNext = useCallback(() => {
    setStarted(true)
    const next = nextUnfilledField(fields, signerValues, visitedRef.current)
    if (!next) {
      setNotice({ tone: 'info', text: 'All required fields are complete. Select Finish to submit.' })
      finishRef.current?.focus()
      return
    }

    visitedRef.current.add(next.id)

    if (next.type === 'signature' || next.type === 'initials') {
      if (!adopted) {
        pendingSignatureFieldRef.current = next.id
        setAdoptOpen(true)
        return
      }
      autoFillOnReach(next)
    } else if (next.type === 'date') {
      autoFillOnReach(next)
    }

    focusField(next)
  }, [fields, signerValues, adopted, autoFillOnReach, focusField])

  const requestSignature = useCallback((field: TemplateField) => {
    setStarted(true)
    if (!adopted) {
      pendingSignatureFieldRef.current = field.id
      setAdoptOpen(true)
      return
    }
    setFieldValue(field.id, field.type === 'initials' ? adopted.initialsPng : adopted.signaturePng)
  }, [adopted, setFieldValue])

  const handleAdopt = (signature: AdoptedSignature) => {
    setAdopted(signature)
    setAdoptOpen(false)

    const pendingId = pendingSignatureFieldRef.current
    pendingSignatureFieldRef.current = null
    if (!pendingId) return

    const field = fields.find((entry) => entry.id === pendingId)
    if (!field) return
    setFieldValue(
      field.id,
      field.type === 'initials' ? signature.initialsPng : signature.signaturePng,
    )
    setActiveFieldId(field.id)
  }

  const acceptConsent = () => {
    setConsentAccepted(true)
    setConsentAcceptedAt(new Date().toISOString())
    setNotice(null)
  }

  const finish = async () => {
    if (!template || locked) return

    const missing = incompleteRequiredFields(fields, signerValues)
    if (missing.length > 0) {
      setInvalidFieldIds(new Set(missing.map((field) => field.id)))
      setNotice({
        tone: 'error',
        text: missing.length === 1
          ? `Complete the required field: ${missing[0].label}.`
          : `${missing.length} required fields still need attention, starting with ${missing[0].label}.`,
      })
      focusField(missing[0])
      return
    }

    if (!consentAccepted) {
      setConsentDismissed(false)
      setNotice({ tone: 'error', text: 'Agree to the electronic records notice before finishing.' })
      return
    }

    setInvalidFieldIds(new Set())
    setIsSubmitting(true)
    try {
      const signedBytes = await flattenSignedPdf(template.pdfDataUrl, template.fields, signerValues)
      const blob = new Blob([signedBytes.buffer as ArrayBuffer], { type: 'application/pdf' })

      // Persist first: the signer should never end up holding a copy of a
      // document the server never accepted.
      const submission = apiEnabled
        ? await completeRemoteSubmission(
          templateId,
          signedBytes,
          consentAccepted,
          consentVersion,
          consentAcceptedAt || new Date().toISOString(),
          signerEmail.trim() || undefined,
        )
        : {
            submissionId: crypto.randomUUID(),
            templateId,
            templateHash: template.pdfHash,
            createdAt: new Date().toISOString(),
            signedAt: new Date().toISOString(),
            signerEmail: signerEmail.trim() || undefined,
            consentVersion,
            consentAcceptedAt: consentAcceptedAt || new Date().toISOString(),
            signerUserAgent: navigator.userAgent,
            emailStatus: 'sent' as const,
            signedPdfDataUrl: await readBlobAsDataUrl(blob),
          }

      if (!apiEnabled) saveSubmission(submission)
      setSignedBlob(blob)
      setCompleted(submission)
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Unable to submit the signed document.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const downloadSigned = () => {
    if (signedBlob) {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = URL.createObjectURL(signedBlob)
      const anchor = document.createElement('a')
      anchor.href = objectUrlRef.current
      anchor.download = `${(template?.name ?? 'document').replace(/\.pdf$/i, '')}-signed.pdf`
      anchor.click()
      return
    }
    if (completed && apiEnabled) void downloadRemoteDocument(completed.submissionId)
  }

  if (session.status === 'loading') return <SignerLoading />
  if (session.status === 'not-found') return <SignerUnavailable kind="not-found" onRetry={retry} />
  if (session.status === 'error') {
    return <SignerUnavailable kind="error" message={session.message} onRetry={retry} />
  }
  if (!template) return <SignerLoading />

  if (completed) {
    return (
      <CompletionScreen
        documentName={template.name}
        emailFailed={completed.emailStatus === 'failed'}
        onDownload={downloadSigned}
      />
    )
  }

  const chipLabel = walkerLabel(progress, started)
  const chipIsFinish = chipLabel === 'Finish'

  return (
    <div className="app-shell signer-shell">
      <ConsentGate
        open={!consentAccepted && !consentDismissed}
        consentVersion={consentVersion}
        supportEmail={supportEmail}
        email={signerEmail}
        onEmailChange={setSignerEmail}
        onAccept={acceptConsent}
        onReviewFirst={() => setConsentDismissed(true)}
      />

      <AdoptSignatureDialog
        open={adoptOpen}
        existing={adopted}
        onAdopt={handleAdopt}
        onCancel={() => {
          pendingSignatureFieldRef.current = null
          setAdoptOpen(false)
        }}
      />

      <header className="topbar signer-topbar">
        <div>
          <p className="eyebrow">Review and sign</p>
          <h1>{template.name}</h1>
        </div>
        <span className="signer-meta">
          {pageCount > 0
            ? `${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · ${progress.total} required ${progress.total === 1 ? 'field' : 'fields'}`
            : 'Loading document'}
        </span>
      </header>

      <section className="signer-panel">
        <FinishBar
          done={progress.done}
          total={progress.total}
          started={started}
          consentAccepted={consentAccepted}
          notice={notice}
          isSubmitting={isSubmitting}
          onReviewNotice={() => setConsentDismissed(false)}
          onNext={goToNext}
          onFinish={() => void finish()}
          finishRef={(element) => { finishRef.current = element }}
        />

        {consentAccepted && (
          <p className="consent-receipt">
            Electronic record disclosure accepted · version {consentVersion}
            <button type="button" className="quiet-button" onClick={() => window.print()}>
              Print notice
            </button>
          </p>
        )}

        <div className="document-toolbar">
          <span>
            {pageCount > 0 ? `Page ${visiblePage} of ${pageCount}` : 'Document view'}
          </span>
          <div className="page-controls">
            <button
              type="button"
              className="quiet-button"
              disabled={visiblePage <= 1}
              onClick={() => scrollToPage(visiblePage - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="quiet-button"
              disabled={visiblePage >= pageCount}
              onClick={() => scrollToPage(visiblePage + 1)}
            >
              Next page
            </button>
          </div>
          <div className="zoom-controls">
            <button type="button" onClick={zoomOut} aria-label="Zoom out">−</button>
            <strong>{Math.round(zoom * 100)}%</strong>
            <button type="button" onClick={zoomIn} aria-label="Zoom in">+</button>
            <button type="button" className="zoom-reset" onClick={() => fitToUsableWidth(stageRef.current)}>Fit</button>
            <button type="button" className="zoom-reset" onClick={resetZoom}>100%</button>
          </div>
        </div>

        <FieldLegend />

        <div className="pdf-stage signer-stage" ref={stageRef}>
          {pdfError && <div className="pdf-error">{pdfError}</div>}
          <Document
            file={pdfSource}
            loading={<DocumentSkeleton />}
            error={<p className="pdf-error">This document could not be displayed.</p>}
            onLoadSuccess={({ numPages }) => {
              setPageCount(numPages)
              setPdfError('')
            }}
            onLoadError={(error) => setPdfError(error.message || 'This document could not be displayed.')}
          >
            {/*
              Page count comes from the parsed file. The API never returns
              pageCount, so the old `template.pageCount ?? max(field.page)`
              fallback silently truncated every document whose last pages had
              no fields on them.
            */}
            {Array.from({ length: pageCount || 1 }, (_, index) => {
              const pageNumber = index + 1
              // The rail sits OUTSIDE .pdf-page. Field overlays are positioned
              // absolutely against .pdf-page, so anything in normal flow inside
              // it (the mobile rail strip was) pushes the canvas down and every
              // field renders above its printed spot by the strip's height.
              return (
                <div className="pdf-page-shell" key={pageNumber}>
                  <FieldBookmarks
                    bookmarks={bookmarks.filter((bookmark) =>
                      bookmark.fieldIds.some((id) =>
                        fields.find((field) => field.id === id)?.page === pageNumber))}
                    zoom={zoom}
                    onJump={(fieldId) => {
                      const field = fields.find((entry) => entry.id === fieldId)
                      if (!field) return
                      visitedRef.current.add(field.id)
                      setStarted(true)
                      if (field.type === 'signature' || field.type === 'initials') {
                        requestSignature(field)
                      } else {
                        autoFillOnReach(field)
                      }
                      focusField(field)
                    }}
                  />
                  <div className="pdf-page" data-page-number={pageNumber}>
                    <Page pageNumber={pageNumber} width={BASE_PAGE_WIDTH * zoom} />
                    {fields
                      .filter((field) => field.page === pageNumber)
                      .map((field) => (
                      <SignerField
                        key={field.id}
                        field={field}
                        value={signerValues[field.id]}
                        zoom={zoom}
                        isActive={activeFieldId === field.id}
                        isInvalid={invalidFieldIds.has(field.id)}
                        required={isEffectivelyRequired(field, fields, signerValues)}
                        applicable={isFieldApplicable(field, fields, signerValues)}
                        controllerLabel={controllerOf(field, fields)?.label}
                        pageWidthPx={BASE_PAGE_WIDTH * zoom}
                        locked={locked}
                        hasSignature={Boolean(adopted)}
                        registerRef={(element) => { fieldRefs.current[field.id] = element }}
                        onFocus={() => {
                          setActiveFieldId(field.id)
                          setStarted(true)
                          visitedRef.current.add(field.id)
                          if (field.type === 'date') autoFillOnReach(field)
                        }}
                        onChange={(value) => setFieldValue(field.id, value)}
                        onRequestSignature={() => requestSignature(field)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </Document>
        </div>
      </section>

      <NextFieldChip
        label={chipLabel}
        isFinish={chipIsFinish}
        hidden={locked}
        onClick={chipIsFinish ? () => void finish() : goToNext}
      />
    </div>
  )
}
