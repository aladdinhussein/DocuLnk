import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Document, Page } from 'react-pdf'
import { computeFileHash, hashMatches } from '../lib/pdfIntegrity'
import { apiEnabled, publishRemoteTemplate, updateRemoteTemplate } from '../lib/apiClient'
import { readLocalTemplates, writeLocalTemplates } from '../lib/localTemplates'
import { copyText, readFileAsDataUrl } from '../lib/browser'
import { BASE_PAGE_WIDTH, clampFieldSize } from '../pdf/fieldGeometry'
import type { FieldInteraction, FieldType, PublishedTemplate, TemplateField } from '../types'
import { DocumentSkeleton } from '../components/DashboardSkeleton'
import '../styles/admin.css'

/** A checkbox is square by default so its mark lands where the box appears. */
const CHECKBOX_SIZE = 18

const defaultFieldForm = {
  label: 'Client name',
  type: 'text' as FieldType,
  required: true,
  x: 120,
  y: 150,
  width: 210,
  height: 26,
  page: 1,
}

export type EditorSeed =
  | { mode: 'new' }
  | { mode: 'edit'; template: PublishedTemplate; file: File }

type EditorScreenProps = {
  seed: EditorSeed
  onClose: () => void
  onPublished: (template: PublishedTemplate) => void
}

export default function EditorScreen({ seed, onClose, onPublished }: EditorScreenProps) {
  const editing = seed.mode === 'edit' ? seed : null
  const [file, setFile] = useState<File | null>(editing?.file ?? null)
  const [fileHash, setFileHash] = useState(editing?.template.pdfHash ?? '')
  const [hashMatchesDocument, setHashMatchesDocument] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [templateFields, setTemplateFields] = useState<TemplateField[]>(editing?.template.fields ?? [])
  const [fieldHistory, setFieldHistory] = useState<TemplateField[][]>([])
  const [fieldFuture, setFieldFuture] = useState<TemplateField[][]>([])
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [fieldForm, setFieldForm] = useState(defaultFieldForm)
  const [publishMessage, setPublishMessage] = useState('')
  const [isPublished, setIsPublished] = useState(Boolean(editing))
  const [requestLink, setRequestLink] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [editingTemplateId] = useState<string | null>(editing?.template.templateId ?? null)
  const [currentTemplateId, setCurrentTemplateId] = useState<string>(
    () => editing?.template.templateId ?? crypto.randomUUID(),
  )
  const [zoom, setZoom] = useState(1)
  const [fieldsHidden, setFieldsHidden] = useState(false)
  const interactionRef = useRef<FieldInteraction | null>(null)
  // Whether the PDF was swapped out while editing an already-published template,
  // so publishing needs to re-upload it and refresh the stored hash.
  const [pdfReplaced, setPdfReplaced] = useState(false)

  useEffect(() => {
    if (!file) {
      setFileHash('')
      setHashMatchesDocument(false)
      return
    }

    void computeFileHash(file).then((hash) => {
      setFileHash(hash)
      void hashMatches(file, hash).then(setHashMatchesDocument)
    })
  }, [file])

  const zoomIn = () => setZoom((current) => Math.min(1.6, Number((current + 0.1).toFixed(1))))
  const zoomOut = () => setZoom((current) => Math.max(0.6, Number((current - 0.1).toFixed(1))))
  const resetZoom = () => setZoom(1)

  const metadata = {
    templateId: currentTemplateId,
    name: file?.name ?? 'template.pdf',
    pdfHash: fileHash,
    hashAlgorithm: 'SHA-256',
    pageCount: pdfPageCount,
    createdAt: new Date().toISOString(),
    fields: templateFields,
  }

  const downloadTemplate = () => {
    const blob = new Blob([JSON.stringify(metadata, null, 2)], {
      type: 'application/json',
    })

    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${file?.name?.replace(/\.pdf$/i, '') ?? 'template'}-metadata.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return
      }

      const deltaX = (event.clientX - interaction.startX) / zoom
      const deltaY = (event.clientY - interaction.startY) / zoom

      setTemplateFields((current) =>
        current.map((field) => {
          if (field.id !== interaction.fieldId) {
            return field
          }

          if (interaction.mode === 'resize') {
            return {
              ...field,
              ...clampFieldSize(
                field.type,
                interaction.fieldWidth + deltaX,
                interaction.fieldHeight + deltaY,
              ),
            }
          }

          const pageElement = Array.from(
            document.querySelectorAll<HTMLElement>('.pdf-page[data-page-number]'),
          ).find((candidate) => {
            const bounds = candidate.getBoundingClientRect()
            return (
              event.clientX >= bounds.left &&
              event.clientX <= bounds.right &&
              event.clientY >= bounds.top &&
              event.clientY <= bounds.bottom
            )
          })
          const targetPage = pageElement
            ? Number(pageElement.dataset.pageNumber)
            : interaction.fieldPage
          const targetPageBounds = pageElement?.getBoundingClientRect()
          const targetX = targetPageBounds
            ? Math.max(0, (event.clientX - targetPageBounds.left) / zoom)
            : interaction.fieldX + deltaX
          const targetY = targetPageBounds
            ? Math.max(0, (event.clientY - targetPageBounds.top) / zoom)
            : interaction.fieldY + deltaY

          return {
            ...field,
            page: targetPage,
            x: targetX,
            y: targetY,
          }
        }),
      )
    }

    const stopInteraction = () => {
      interactionRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopInteraction)
    window.addEventListener('pointercancel', stopInteraction)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopInteraction)
      window.removeEventListener('pointercancel', stopInteraction)
    }
  }, [zoom])


  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) {
      return
    }

    setFile(selectedFile)
    // Replacing the PDF on an already-published template must keep updating
    // that same record (and its public URL), not mint a new templateId.
    if (editingTemplateId) {
      setPdfReplaced(true)
    } else {
      setCurrentTemplateId(crypto.randomUUID())
    }
    setPdfError('')
    setPdfPageCount(0)
    setPublishMessage('')
    setIsPublished(false)
    setRequestLink('')
    setLinkCopied(false)
    setTemplateFields([])
    setFieldHistory([])
    setFieldFuture([])
    setSelectedFieldId(null)
    setFieldForm(defaultFieldForm)
  }

  const addField = () => {
    const newField: TemplateField = {
      id: crypto.randomUUID(),
      label: fieldForm.label || 'New field',
      type: fieldForm.type,
      required: fieldForm.required,
      x: fieldForm.x,
      y: fieldForm.y,
      width: fieldForm.width,
      height: fieldForm.height,
      page: fieldForm.page,
    }

    commitFields([...templateFields, newField])
    setFieldForm((current) => ({
      ...current,
      label: '',
      x: Math.min(current.x + 24, 320),
      y: Math.min(current.y + 34, 420),
    }))
  }

  /**
   * A checkbox snaps to a small square. The shared 210x26 default left it a wide
   * rectangle, so the mark it produced never sat where the box appeared to be.
   */
  const changeFieldType = (type: FieldType) => {
    setFieldForm((current) => {
      if (type !== 'checkbox' || current.type === 'checkbox') return { ...current, type }
      return { ...current, type, width: CHECKBOX_SIZE, height: CHECKBOX_SIZE }
    })
  }

  /** Move the selected field by whole units; Shift jumps further. */
  const nudgeSelectedField = (deltaX: number, deltaY: number) => {
    if (!selectedFieldId) return
    commitFields(
      templateFields.map((field) =>
        field.id === selectedFieldId
          ? { ...field, x: Math.max(0, field.x + deltaX), y: Math.max(0, field.y + deltaY) }
          : field,
      ),
    )
    setFieldForm((current) => ({
      ...current,
      x: Math.max(0, current.x + deltaX),
      y: Math.max(0, current.y + deltaY),
    }))
  }

  const updateFieldForm = <K extends keyof typeof fieldForm>(
    key: K,
    value: (typeof fieldForm)[K],
  ) => {
    setFieldForm((current) => ({ ...current, [key]: value }))
  }

  const removeField = (fieldId: string) => {
    commitFields(templateFields.filter((field) => field.id !== fieldId))
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null)
      setFieldForm(defaultFieldForm)
    }
  }

  const selectField = (field: TemplateField) => {
    setSelectedFieldId(field.id)
    setFieldForm({
      label: field.label,
      type: field.type,
      required: field.required,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      page: field.page,
    })
  }

  const saveFieldEdits = () => {
    if (!selectedFieldId) {
      return
    }

    commitFields(
      templateFields.map((field) =>
        field.id === selectedFieldId
          ? {
              ...field,
              label: fieldForm.label || 'Untitled field',
              type: fieldForm.type,
              required: fieldForm.required,
              x: Math.max(0, fieldForm.x),
              y: Math.max(0, fieldForm.y),
              ...clampFieldSize(fieldForm.type, fieldForm.width, fieldForm.height),
              page: Math.max(1, Math.min(pdfPageCount || 1, fieldForm.page)),
            }
          : field,
      ),
    )
  }

  const commitFields = (nextFields: TemplateField[]) => {
    setFieldHistory((current) => [...current, templateFields])
    setFieldFuture([])
    setTemplateFields(nextFields)
  }

  const undoFieldChange = () => {
    const previous = fieldHistory.at(-1)
    if (!previous) return
    setFieldHistory((current) => current.slice(0, -1))
    setFieldFuture((current) => [...current, templateFields])
    setTemplateFields(previous)
  }

  const redoFieldChange = () => {
    const next = fieldFuture.at(-1)
    if (!next) return
    setFieldFuture((current) => current.slice(0, -1))
    setFieldHistory((current) => [...current, templateFields])
    setTemplateFields(next)
  }

  const duplicateField = (field: TemplateField) => {
    commitFields([
      ...templateFields,
      { ...field, id: crypto.randomUUID(), x: field.x + 24, y: field.y + 24, label: `${field.label} copy` },
    ])
  }

  // Arrow-key nudging, for the last pixel or two that dragging cannot land.
  useEffect(() => {
    if (!selectedFieldId) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 10 : 1
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const move = moves[event.key]
      if (!move) return

      // Don't hijack arrow keys while the signer is typing in the field form.
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return

      event.preventDefault()
      nudgeSelectedField(move[0], move[1])
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const startFieldInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    field: TemplateField,
    mode: FieldInteraction['mode'],
  ) => {
    event.preventDefault()
    event.stopPropagation()
    interactionRef.current = {
      fieldId: field.id,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      fieldX: field.x,
      fieldY: field.y,
      fieldWidth: field.width,
      fieldHeight: field.height,
      fieldPage: field.page,
    }
  }

  const generateFormLink = () => {
    if (!isPublished) {
      setPublishMessage('Publish the template before copying its public form link.')
      return
    }

    const link = `${window.location.origin}/form/${metadata.templateId}`
    setRequestLink(link)
    setLinkCopied(false)
  }

  const copyRequestLink = async () => {
    if (!requestLink) {
      return
    }

    if (await copyText(requestLink)) setLinkCopied(true)
  }



  const publishTemplate = async () => {
    if (!file || !fileHash) {
      setPublishMessage('Upload a PDF before publishing the template.')
      setIsPublished(false)
      return
    }

    const currentHash = await computeFileHash(file)
    if (currentHash !== fileHash) {
      setPublishMessage('The PDF changed after setup. Reload it before publishing.')
      setIsPublished(false)
      return
    }

    const publishedMetadata = {
      ...metadata,
      status: 'published',
      publishedAt: new Date().toISOString(),
      pdfDataUrl: await readFileAsDataUrl(file),
    }

    if (apiEnabled) {
      if (editingTemplateId) {
        await updateRemoteTemplate(
          editingTemplateId,
          metadata.name,
          metadata.fields,
          pdfReplaced ? { file, pdfHash: metadata.pdfHash } : undefined,
        )
      } else {
        await publishRemoteTemplate(file, {
          name: metadata.name,
          pdfHash: metadata.pdfHash,
          fields: metadata.fields,
        })
      }
    } else {
      const templates = readLocalTemplates().filter((template) => template.templateId !== publishedMetadata.templateId)
      writeLocalTemplates([...templates, publishedMetadata])
    }
    onPublished(publishedMetadata)
    setPublishMessage('Template published and saved in this browser.')
    setIsPublished(true)
    setPdfReplaced(false)
  }


  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-top">
          <button type="button" className="back-link" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Templates
          </button>
          <div className="app-header-actions">
            <span className="status-chip" data-state={isPublished ? 'live' : 'draft'}>
              {isPublished ? 'Live' : 'Draft'}
            </span>
            <button
              type="button"
              className="primary-button"
              disabled={!file}
              onClick={publishTemplate}
            >
              {isPublished ? 'Publish changes' : 'Publish template'}
            </button>
          </div>
        </div>
        <div className="app-header-identity">
          <h1>{file?.name ?? 'New template'}</h1>
          <p className="app-header-meta">
            <span>{templateFields.length} {templateFields.length === 1 ? 'field' : 'fields'}</span>
            {pdfPageCount > 0 && (
              <>
                <span className="dot" />
                <span>{pdfPageCount} {pdfPageCount === 1 ? 'page' : 'pages'}</span>
              </>
            )}
            {fileHash && (
              <>
                <span className="dot" />
                <span>{hashMatchesDocument ? 'SHA-256 verified' : 'Hash mismatch'}</span>
              </>
            )}
          </p>
        </div>
      </header>

      {publishMessage && (
        <p className="header-notice" data-tone={isPublished ? 'success' : 'error'} role="status">
          {publishMessage}
        </p>
      )}

      <main className="workspace">
        <aside className="panel">
          <h2>1. Upload PDF</h2>
          <label className="upload-box">
            <input type="file" accept="application/pdf" onChange={handleFileChange} />
            <span>{file ? 'Replace PDF' : 'Choose template PDF'}</span>
          </label>

          {file && (
            <div className="file-meta">
              <strong>{file.name}</strong>
              <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          )}

          {fileHash && (
            <div className={`hash-box ${hashMatchesDocument ? 'hash-valid' : 'hash-warning'}`}>
              <span className="label">SHA-256</span>
              <code>{fileHash}</code>
            </div>
          )}

          <div className="meta-card">
            <h3>Integrity model</h3>
            <p>
              Each template stores the original PDF hash so we can detect if the source
              file was replaced after the field layout was configured.
            </p>
          </div>
        </aside>

        <section className="panel preview-panel">
          <div className="panel-heading-row">
            <h2>2. Template preview</h2>
            <div className="zoom-controls">
              <button type="button" onClick={zoomOut} aria-label="Zoom out">−</button>
              <strong>{Math.round(zoom * 100)}%</strong>
              <button type="button" onClick={zoomIn} aria-label="Zoom in">+</button>
              <button type="button" className="zoom-reset" onClick={resetZoom}>Reset</button>
              {/*
                Field outlines sit on top of the printed form, so aligning a
                checkbox to a pre-printed box means being able to see the box.
              */}
              <button
                type="button"
                className="zoom-reset"
                aria-pressed={fieldsHidden}
                onClick={() => setFieldsHidden((current) => !current)}
              >
                {fieldsHidden ? 'Show fields' : 'Hide fields'}
              </button>
            </div>
          </div>

          {file ? (
            <div className={`pdf-stage ${fieldsHidden ? 'fields-hidden' : ''}`}>
              <Document
                file={file}
                loading={<DocumentSkeleton label="Rendering template" />}
                onLoadSuccess={({ numPages }) => setPdfPageCount(numPages)}
                onLoadError={(error) => {
                  setPdfError(error.message || 'The PDF could not be loaded.')
                }}
              >
                {Array.from({ length: pdfPageCount || 1 }, (_, index) => {
                  const pageNumber = index + 1
                  return (
                    <div
                      className="pdf-page"
                      data-page-number={pageNumber}
                      key={pageNumber}
                    >
                      <Page pageNumber={pageNumber} width={BASE_PAGE_WIDTH * zoom} />
                      {templateFields
                        .filter((field) => field.page === pageNumber)
                        .map((field) => (
                          <div
                            key={field.id}
                            className={`field-overlay field-${field.type} ${selectedFieldId === field.id ? 'field-overlay-selected' : ''}`}
                            style={{
                              left: `${field.x * zoom}px`,
                              top: `${field.y * zoom}px`,
                              width: `${field.width * zoom}px`,
                              height: `${field.height * zoom}px`,
                            }}
                            onPointerDown={(event) => startFieldInteraction(event, field, 'move')}
                            onClick={() => selectField(field)}
                            title={`${field.label} (${field.type})`}
                          >
                            {/*
                              The label used to print inside every box, over the
                              form's own text. It now appears only where there is
                              genuine room, and the field list names them all.
                            */}
                            {field.width * zoom >= 64 && field.height * zoom >= 18 && (
                              <span className="field-overlay-label">{field.label}</span>
                            )}
                            <span
                              className="resize-handle"
                              onPointerDown={(event) => startFieldInteraction(event, field, 'resize')}
                              aria-label={`Resize ${field.label}`}
                              role="button"
                            />
                          </div>
                        ))}
                    </div>
                  )
                })}
              </Document>

              {pdfError && <div className="pdf-error">{pdfError}</div>}
            </div>
          ) : (
            <div className="empty-state">Upload a PDF to begin editing.</div>
          )}
        </section>

        <aside className="panel">
          <h2>3. Configure fields</h2>

          <p className="field-selection-help">
            {selectedFieldId ? 'Editing selected field' : 'Click a field on the document to edit it'}
          </p>

          <div className="field-history-controls">
            <button type="button" className="quiet-button" onClick={undoFieldChange} disabled={!fieldHistory.length}>
              Undo
            </button>
            <button type="button" className="quiet-button" onClick={redoFieldChange} disabled={!fieldFuture.length}>
              Redo
            </button>
          </div>

          <div className="field-form">
            <label>
              Label
              <input
                value={fieldForm.label}
                onChange={(event) => updateFieldForm('label', event.target.value)}
              />
            </label>

            <div className="row">
              <label>
                Type
                <select
                  value={fieldForm.type}
                  onChange={(event) => changeFieldType(event.target.value as FieldType)}
                >
                  <option value="text">Text</option>
                  <option value="signature">Signature</option>
                  <option value="initials">Initials</option>
                  <option value="date">Date</option>
                  <option value="checkbox">Checkbox</option>
                </select>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={fieldForm.required}
                  onChange={(event) =>
                    updateFieldForm('required', event.target.checked)
                  }
                />
                Required
              </label>
            </div>

            {/*
              Numeric placement, because dragging a small checkbox onto a
              pre-printed box on the form is guesswork. Values are in the same
              units the field is stored in, so they are stable across zoom.
            */}
            <div className="row position-row">
              <label>
                X
                <input
                  type="number"
                  value={Math.round(fieldForm.x)}
                  onChange={(event) => updateFieldForm('x', Number(event.target.value))}
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={Math.round(fieldForm.y)}
                  onChange={(event) => updateFieldForm('y', Number(event.target.value))}
                />
              </label>
              <label>
                W
                <input
                  type="number"
                  value={Math.round(fieldForm.width)}
                  onChange={(event) => updateFieldForm('width', Number(event.target.value))}
                />
              </label>
              <label>
                H
                <input
                  type="number"
                  value={Math.round(fieldForm.height)}
                  onChange={(event) => updateFieldForm('height', Number(event.target.value))}
                />
              </label>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                // Saving must only save. This previously also called addField(),
                // which read the pre-save templateFields and so overwrote the
                // edit with a duplicate of the original.
                if (selectedFieldId) {
                  saveFieldEdits()
                  setSelectedFieldId(null)
                  setFieldForm(defaultFieldForm)
                } else {
                  addField()
                }
              }}
            >
              {selectedFieldId ? 'Save field changes' : 'Add field'}
            </button>
            {selectedFieldId && (
              <p className="field-hint">
                Nudge with <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd>, or hold{' '}
                <kbd>Shift</kbd> for 10 at a time.
              </p>
            )}
            {selectedFieldId && (
              <button
                type="button"
                className="quiet-button"
                onClick={() => {
                  setSelectedFieldId(null)
                  setFieldForm(defaultFieldForm)
                }}
              >
                Stop editing
              </button>
            )}
          </div>

          <div className="field-list">
            {templateFields.map((field) => (
              <div key={field.id} className="field-item">
                <div>
                  <strong>{field.label}</strong>
                  <span>
                    {field.type} · {field.required ? 'required' : 'optional'}
                  </span>
                </div>
                <div className="field-item-actions">
                  <button type="button" onClick={() => duplicateField(field)}>Duplicate</button>
                  <button type="button" onClick={() => removeField(field.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="secondary-button export-button" onClick={downloadTemplate}>
            Download template metadata
          </button>

          <div className="request-card">
            <h3>Public form link</h3>
            <p>Publish this form once, then share its stable URL with anyone who needs to complete it.</p>
            <button
              type="button"
              className="secondary-button"
              onClick={generateFormLink}
              disabled={!isPublished}
            >
              Copy public form link
            </button>

            {requestLink && (
              <>
                <input className="request-link" readOnly value={requestLink} />
                <button type="button" className="secondary-button" onClick={copyRequestLink}>
                  {linkCopied ? 'Link copied' : 'Copy link'}
                </button>
              </>
            )}
          </div>
        </aside>
      </main>
    </div>
  )


}
