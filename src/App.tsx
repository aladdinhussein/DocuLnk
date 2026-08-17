import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import './App.css'
import { computeFileHash, hashMatches } from './lib/pdfIntegrity'
import {
  deleteSigningRequest,
  getSigningRequest,
  isRequestExpired,
  listSigningRequests,
  saveSigningRequest,
  updateSigningRequest,
} from './lib/requestStore'
import type { StoredSigningRequest } from './lib/requestStore'
import {
  apiEnabled,
  completeRemoteRequest,
  createRemoteRequest,
  downloadRemoteDocument,
  extendRemoteRequest,
  getRemoteTemplate,
  listRemoteRequests,
  listRemoteTemplates,
  publishRemoteTemplate,
  resendRemoteRequest,
  updateRemoteTemplate,
  revokeRemoteRequest,
  deleteRemoteRequest,
} from './lib/apiClient'
import { authEnabled, getCurrentUser, loginUrl, logoutUrl } from './lib/auth'
import type { AuthUser } from './lib/auth'
import { getRemoteSignerPayload } from './lib/remoteSigner'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

type FieldType = 'text' | 'signature' | 'initials' | 'date' | 'checkbox'

type TemplateField = {
  id: string
  label: string
  type: FieldType
  required: boolean
  x: number
  y: number
  width: number
  height: number
  page: number
}

type FieldInteraction = {
  fieldId: string
  mode: 'move' | 'resize'
  pointerId: number
  startX: number
  startY: number
  fieldX: number
  fieldY: number
  fieldWidth: number
  fieldHeight: number
  fieldPage: number
}

type PublishedTemplate = {
  templateId: string
  name: string
  pdfHash: string
  hashAlgorithm: string
  pageCount?: number
  fields: TemplateField[]
  pdfDataUrl: string
}

type SigningRequestData = {
  requestId: string
  templateId: string
  templateHash: string
  status: StoredSigningRequest['status']
  createdAt: string
  expiresAt: string
  viewedAt?: string
  signedAt?: string
}

const isSigningPage = window.location.pathname.startsWith('/sign/')
const consentVersion = '2026-08-16-v1'
const supportEmail = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) ?? ''
const localTemplatesKey = 'doculnk-templates'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function readLocalTemplates(): PublishedTemplate[] {
  const collection = JSON.parse(localStorage.getItem(localTemplatesKey) ?? '[]') as PublishedTemplate[]
  if (collection.length > 0) return collection

  const legacy = JSON.parse(localStorage.getItem('doculnk-template-demo') ?? 'null') as PublishedTemplate | null
  return legacy ? [legacy] : []
}

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

const initialFields: TemplateField[] = [
  {
    id: 'field-1',
    label: 'Client name',
    type: 'text',
    required: true,
    x: 120,
    y: 150,
    width: 220,
    height: 26,
    page: 1,
  },
  {
    id: 'field-2',
    label: 'Signature',
    type: 'signature',
    required: true,
    x: 120,
    y: 270,
    width: 220,
    height: 52,
    page: 1,
  },
]

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [fileHash, setFileHash] = useState('')
  const [hashMatchesDocument, setHashMatchesDocument] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [templateFields, setTemplateFields] = useState<TemplateField[]>(initialFields)
  const [fieldHistory, setFieldHistory] = useState<TemplateField[][]>([])
  const [fieldFuture, setFieldFuture] = useState<TemplateField[][]>([])
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [fieldForm, setFieldForm] = useState(defaultFieldForm)
  const [publishMessage, setPublishMessage] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [requestLink, setRequestLink] = useState('')
  const [requestExpiresAt, setRequestExpiresAt] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [signingData, setSigningData] = useState<{
    request: SigningRequestData
    template: PublishedTemplate
  } | null>(null)
  const [signerValues, setSignerValues] = useState<Record<string, string>>({})
  const [signatureDraft, setSignatureDraft] = useState('')
  const [savedSignature, setSavedSignature] = useState('')
  const [signatureMode, setSignatureMode] = useState<'type' | 'draw'>('draw')
  const [isDrawingSignature, setIsDrawingSignature] = useState(false)
  const [showSignatureSetup, setShowSignatureSetup] = useState(false)
  const [signatureMessage, setSignatureMessage] = useState('')
  const [submitMessage, setSubmitMessage] = useState('')
  const [submissionComplete, setSubmissionComplete] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [signerConsent, setSignerConsent] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [publishedTemplates, setPublishedTemplates] = useState<PublishedTemplate[]>([])
  const [templateLinks, setTemplateLinks] = useState<Record<string, string>>({})
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [currentTemplateId, setCurrentTemplateId] = useState<string>(() => crypto.randomUUID())
  const [recipientEmail, setRecipientEmail] = useState('')
  const [signingRequests, setSigningRequests] = useState<StoredSigningRequest[]>([])
  const [zoom, setZoom] = useState(1)
  const [activeSignerFieldId, setActiveSignerFieldId] = useState('')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(authEnabled)
  const signerFieldRefs = useRef<Record<string, HTMLInputElement | HTMLButtonElement | null>>({})
  const consentRef = useRef<HTMLInputElement | null>(null)
  const submitRef = useRef<HTMLButtonElement | null>(null)
  const interactionRef = useRef<FieldInteraction | null>(null)
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null)

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

  useEffect(() => {
    if (!isSigningPage) {
      return
    }

    const requestId = window.location.pathname.split('/').filter(Boolean).pop()
    if (!requestId) {
      return
    }

    if (apiEnabled) {
      void getRemoteSignerPayload(requestId).then((payload) => {
        setSigningData({
          request: payload.request,
          template: payload.template as PublishedTemplate,
        })
      })
      return
    }

    const request = getSigningRequest(requestId) as SigningRequestData | null
    const template = readLocalTemplates().find((item) => item.templateId === request?.templateId) ?? null

    if (
      !request ||
      !template ||
      isRequestExpired(request) ||
      request.status === 'revoked' ||
      request.status === 'completed'
    ) {
      return
    }

    updateSigningRequest(requestId, { status: 'viewed', viewedAt: new Date().toISOString() })

    if (request.templateHash !== template.pdfHash || !template.pdfDataUrl) {
      return
    }

    setSigningData({ request, template })
  }, [])

  useEffect(() => {
    if (!authEnabled) {
      return
    }

    void getCurrentUser().then((user) => {
      setCurrentUser(user)
      setAuthLoading(false)
    })
  }, [])

  useEffect(() => {
    if (isSigningPage) {
      return
    }

    if (apiEnabled) {
      void Promise.all([listRemoteTemplates(), listRemoteRequests()]).then(
        ([templates, requests]) => {
          setPublishedTemplates(templates as PublishedTemplate[])
          setSigningRequests(requests)
        },
      )
      return
    }

    const savedTemplates = readLocalTemplates()
    if (savedTemplates.length > 0) setPublishedTemplates(savedTemplates)
    setSigningRequests(listSigningRequests())
  }, [])

  const refreshSigningRequests = () => {
    if (apiEnabled) {
      void listRemoteRequests().then(setSigningRequests)
      return
    }
    setSigningRequests(listSigningRequests())
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) {
      return
    }

    setFile(selectedFile)
    setCurrentTemplateId(crypto.randomUUID())
    setEditingTemplateId(null)
    setPdfError('')
    setPdfPageCount(0)
    setPublishMessage('')
    setIsPublished(false)
    setRequestLink('')
    setRequestExpiresAt('')
    setLinkCopied(false)
    setTemplateFields(initialFields)
    setFieldHistory([])
    setFieldFuture([])
    setSelectedFieldId(null)
    setFieldForm(defaultFieldForm)
  }

  const openTemplateEditor = async (template: PublishedTemplate) => {
    let source = template
    if (apiEnabled && !source.pdfDataUrl) {
      source = await getRemoteTemplate(template.templateId) as PublishedTemplate
    }
    const [header, encoded] = source.pdfDataUrl.split(',')
    const mime = header.match(/data:(.*);base64/)?.[1] ?? 'application/pdf'
    const binary = atob(encoded ?? '')
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    setFile(new File([bytes], source.name, { type: mime }))
    setCurrentTemplateId(source.templateId)
    setFileHash(source.pdfHash)
    setTemplateFields(source.fields)
    setEditingTemplateId(source.templateId)
    setIsPublished(true)
    setIsEditorOpen(true)
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

  const updateFieldForm = <K extends keyof typeof fieldForm>(
    key: K,
    value: (typeof fieldForm)[K],
  ) => {
    setFieldForm((current) => ({ ...current, [key]: value }))
  }

  const updateFieldPage = (page: number) => {
    updateFieldForm('page', Math.max(1, Math.min(pdfPageCount || 1, page)))
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
              width: Math.max(48, fieldForm.width),
              height: Math.max(24, fieldForm.height),
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
              width: Math.max(48, interaction.fieldWidth + deltaX),
              height: Math.max(24, interaction.fieldHeight + deltaY),
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

  const metadata = {
    templateId: currentTemplateId,
    name: file?.name ?? 'template.pdf',
    pdfHash: fileHash,
    hashAlgorithm: 'SHA-256',
    pageCount: pdfPageCount,
    createdAt: new Date().toISOString(),
    fields: templateFields,
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
        await updateRemoteTemplate(editingTemplateId, metadata.name, metadata.fields)
      } else {
        await publishRemoteTemplate(file, {
          name: metadata.name,
          pdfHash: metadata.pdfHash,
          fields: metadata.fields,
        })
      }
    } else {
      const templates = readLocalTemplates().filter((template) => template.templateId !== publishedMetadata.templateId)
      localStorage.setItem(localTemplatesKey, JSON.stringify([...templates, publishedMetadata]))
    }
    setPublishedTemplates((current) => [
      ...current.filter((template) => template.templateId !== publishedMetadata.templateId),
      publishedMetadata,
    ])
    setPublishMessage('Template published and saved in this browser.')
    setIsPublished(true)
  }

  const generateRequestLink = () => {
    if (!isPublished) {
      setPublishMessage('Publish the template before generating a signing link.')
      return
    }

    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const link = `${window.location.origin}/sign/${token}`

    saveSigningRequest({
      requestId: token,
      templateId: metadata.templateId,
      templateHash: metadata.pdfHash,
      status: 'sent',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    })
    refreshSigningRequests()
    setRequestLink(link)
    setRequestExpiresAt(expiresAt.toLocaleDateString())
    setLinkCopied(false)
  }

  const generateTemplateRequestLink = async (template: PublishedTemplate) => {
    const email = recipientEmail.trim()
    if (!email || !email.includes('@')) {
      setPublishMessage('Enter a valid signer email before generating a link.')
      return
    }

    if (apiEnabled) {
      const request = await createRemoteRequest(template.templateId, email)
      setTemplateLinks((current) => ({
        ...current,
        [template.templateId]: `${window.location.origin}/sign/${request.requestId}`,
      }))
      setSigningRequests((current) => [request, ...current])
      return
    }

    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const link = `${window.location.origin}/sign/${token}`

    saveSigningRequest({
      requestId: token,
      templateId: template.templateId,
      templateHash: template.pdfHash,
      recipientEmail: email,
      status: 'sent',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    })
    refreshSigningRequests()
    setTemplateLinks((current) => ({ ...current, [template.templateId]: link }))
    setPublishMessage('Signing link generated for the signer email. Send it manually in local mode.')
  }

  const copyTemplateLink = async (templateId: string) => {
    const link = templateLinks[templateId]
    if (!link) {
      return
    }

    await navigator.clipboard.writeText(link)
  }

  const revokeSigningRequest = (requestId: string) => {
    if (apiEnabled) {
      void revokeRemoteRequest(requestId).then(refreshSigningRequests)
      return
    }
    updateSigningRequest(requestId, { status: 'revoked' })
    refreshSigningRequests()
  }
  const deleteRevokedRequest = (requestId: string) => {
    if (apiEnabled) {
      void deleteRemoteRequest(requestId).then(refreshSigningRequests)
      return
    }
    deleteSigningRequest(requestId)
    refreshSigningRequests()
  }

  const resendRequest = (requestId: string) => {
    if (apiEnabled) {
      void resendRemoteRequest(requestId).then(refreshSigningRequests)
    }
  }

  const extendRequest = (requestId: string) => {
    if (apiEnabled) {
      void extendRemoteRequest(requestId, 7).then(refreshSigningRequests)
    }
  }

  const copyExistingRequestLink = async (requestId: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/sign/${requestId}`)
  }

  const downloadLocalDocument = (request: StoredSigningRequest) => {
    if (!request.signedPdfDataUrl) return
    const anchor = document.createElement('a')
    anchor.href = request.signedPdfDataUrl
    anchor.download = `${request.requestId}-signed.pdf`
    anchor.click()
  }

  const downloadCompletedDocument = (request: StoredSigningRequest) => {
    if (apiEnabled) {
      void downloadRemoteDocument(request.requestId)
      return
    }
    downloadLocalDocument(request)
  }

  const zoomIn = () => setZoom((current) => Math.min(1.6, Number((current + 0.1).toFixed(1))))
  const zoomOut = () => setZoom((current) => Math.max(0.6, Number((current - 0.1).toFixed(1))))
  const resetZoom = () => setZoom(1)

  const copyRequestLink = async () => {
    if (!requestLink) {
      return
    }

    await navigator.clipboard.writeText(requestLink)
    setLinkCopied(true)
  }

  const saveSignature = () => {
    const signature =
      signatureMode === 'draw'
        ? signatureCanvasRef.current?.toDataURL('image/png') ?? ''
        : signatureDraft.trim()
    if (!signature) {
      setSignatureMessage(signatureMode === 'draw' ? 'Draw your signature first.' : 'Enter your name to create a signature.')
      return
    }

    setSavedSignature(signature)
    setShowSignatureSetup(false)
    setSignatureMessage('Signature saved for this signing request.')
  }

  const beginSignatureDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current
    if (!canvas) {
      return
    }

    const bounds = canvas.getBoundingClientRect()
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    canvas.setPointerCapture(event.pointerId)
    context.lineWidth = 3
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#172033'
    context.beginPath()
    context.moveTo(event.clientX - bounds.left, event.clientY - bounds.top)
    setIsDrawingSignature(true)
  }

  const continueSignatureDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingSignature) {
      return
    }

    const canvas = signatureCanvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    const bounds = canvas.getBoundingClientRect()
    context.lineTo(event.clientX - bounds.left, event.clientY - bounds.top)
    context.stroke()
  }

  const clearSignatureDrawing = () => {
    const canvas = signatureCanvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    context.clearRect(0, 0, canvas.width, canvas.height)
    setIsDrawingSignature(false)
  }

  const submitSignedDocument = async () => {
    if (!signingData || submissionComplete || isSubmitting) {
      return
    }

    setIsSubmitting(true)

    const missingField = signingData.template.fields.find(
      (field) => field.required && !signerValues[field.id],
    )
    if (missingField) {
      setSubmitMessage(`Complete the required field: ${missingField.label}.`)
      setIsSubmitting(false)
      return
    }

    if (!signerConsent) {
      setSubmitMessage('Confirm the signature disclosure before submitting.')
      setIsSubmitting(false)
      return
    }

    try {
    const pdfDocument = await PDFDocument.load(dataUrlToBytes(signingData.template.pdfDataUrl))
    const pages = pdfDocument.getPages()
    const font = await pdfDocument.embedFont(StandardFonts.Helvetica)
    const signatureFont = await pdfDocument.embedFont(StandardFonts.HelveticaOblique)
    const pageScale = pages[0].getWidth() / 500

    for (const field of signingData.template.fields) {
      const page = pages[field.page - 1]
      if (!page) {
        continue
      }

      const value = signerValues[field.id]
      if (!value || field.type === 'checkbox' && value !== 'true') {
        continue
      }

      if (field.type === 'signature' && value.startsWith('data:image/png')) {
        const signatureImage = await pdfDocument.embedPng(dataUrlToBytes(value))
        page.drawImage(signatureImage, {
          x: field.x * pageScale + 4,
          y: page.getHeight() - (field.y + field.height) * pageScale + 4,
          width: field.width * pageScale - 8,
          height: field.height * pageScale - 8,
        })
        continue
      }

      const fontSize = Math.max(9, Math.min(18, field.height * pageScale * 0.55))
      page.drawText(field.type === 'checkbox' ? 'X' : value, {
        x: field.x * pageScale + 4,
        y: page.getHeight() - (field.y + field.height) * pageScale + 4,
        size: fontSize,
        font: field.type === 'signature' ? signatureFont : font,
        color: rgb(0.1, 0.12, 0.2),
        maxWidth: field.width * pageScale - 8,
      })
    }

    const signedBytes = await pdfDocument.save()
    const signedBlob = new Blob([signedBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
    const signedUrl = URL.createObjectURL(signedBlob)
    const anchor = document.createElement('a')
    anchor.href = signedUrl
    anchor.download = `${signingData.template.name.replace(/\.pdf$/i, '')}-signed.pdf`
    anchor.click()
    URL.revokeObjectURL(signedUrl)

    if (apiEnabled) {
      await completeRemoteRequest(
        signingData.request.requestId,
        signedBytes,
        signerConsent,
        consentVersion,
        new Date().toISOString(),
      )
    } else {
      updateSigningRequest(signingData.request.requestId, {
        status: 'completed',
        signedAt: new Date().toISOString(),
        consentVersion,
        consentAcceptedAt: new Date().toISOString(),
        signerUserAgent: navigator.userAgent,
        signedPdfDataUrl: await readBlobAsDataUrl(signedBlob),
      })
    }
    setSubmissionComplete(true)
    setIsSubmitting(false)
    setSubmitMessage('Signed document downloaded successfully.')
    } catch (error) {
      setIsSubmitting(false)
      setSubmitMessage(error instanceof Error ? error.message : 'Unable to submit the signed document.')
    }
  }

  const focusNextSignerField = () => {
    if (!signingData) {
      return
    }

    const fields = [...signingData.template.fields].sort(
      (first, second) => first.page - second.page || first.y - second.y || first.x - second.x,
    )
    const activeIndex = fields.findIndex((field) => field.id === activeSignerFieldId)
    const nextField = fields
      .slice(activeIndex + 1)
      .find((field) => !signerValues[field.id]) ?? fields.find((field) => !signerValues[field.id])

    if (!nextField) {
      if (!signerConsent) {
        setSubmitMessage('All fields are complete. Confirm authorization to continue.')
        requestAnimationFrame(() => consentRef.current?.focus())
      } else {
        setSubmitMessage('All fields are complete. Submit the signed document.')
        requestAnimationFrame(() => submitRef.current?.focus())
      }
      return
    }

    setActiveSignerFieldId(nextField.id)
    requestAnimationFrame(() => {
      const element = signerFieldRefs.current[nextField.id]
      element?.focus()
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  if (isSigningPage) {
    if (!signingData) {
      return (
        <div className="app-shell centered-message">
          <h1>Signing request unavailable</h1>
          <p>This request is missing, expired, or no longer matches its template.</p>
        </div>
      )
    }

    const { request, template } = signingData
    const signerFields = [...template.fields].sort(
      (first, second) => first.page - second.page || first.y - second.y || first.x - second.x,
    )
    const requiredFieldsComplete = signerFields.every(
      (field) => !field.required || Boolean(signerValues[field.id]),
    )
    return (
      <div className="app-shell signer-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Secure document request</p>
            <h1>Review and sign</h1>
          </div>
          <span className="request-expiry">Expires {new Date(request.expiresAt).toLocaleDateString()}</span>
        </header>
        <section className="signer-panel">
          <h2>{template.name}</h2>
          <p className="signer-intro">Complete the highlighted fields, authorize the signing, then submit.</p>
          {submissionComplete && (
            <section className="submission-complete-banner" aria-live="polite">
              <span className="thank-you-mark">✓</span>
              <div>
                <strong>Thank you. Your document has been signed.</strong>
                <span>Your signed copy was downloaded. You can close this window.</span>
              </div>
            </section>
          )}
          <div className={`signer-action-bar ${submissionComplete ? 'signer-action-bar-complete' : ''}`}>
            {submissionComplete ? (
              <strong>Signing complete</strong>
            ) : (
              <>
            <div className="signer-progress">
              <strong>
                {activeSignerFieldId
                  ? `Field ${signerFields.findIndex((field) => field.id === activeSignerFieldId) + 1} of ${signerFields.length}`
                  : `${signerFields.length} fields`}
              </strong>
              <span>{signerConsent ? 'Authorized to sign' : 'Authorization required'}</span>
            </div>
            <button type="button" className="secondary-button" onClick={focusNextSignerField}>
              Next
            </button>
            <button
              ref={submitRef}
              type="button"
              className="primary-button"
              disabled={!requiredFieldsComplete || isSubmitting || submissionComplete}
              onClick={submitSignedDocument}
            >
              {isSubmitting
                ? 'Submitting...'
                : requiredFieldsComplete
                  ? 'Submit signed document'
                  : 'Complete required fields'}
            </button>
              </>
            )}
          </div>
          <div className="signature-setup-card">
            <div>
              <strong>{savedSignature ? 'Signature ready' : 'Set up your signature'}</strong>
              <span>
                {savedSignature?.startsWith('data:image/png') ? 'Drawn signature ready' : savedSignature || 'Create it once, then use Sign here.'}
              </span>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setSignatureDraft(savedSignature.startsWith('data:image/png') ? '' : savedSignature)
                setShowSignatureSetup(true)
                setSignatureMessage('')
              }}
            >
              {savedSignature ? 'Edit signature' : 'Set up signature'}
            </button>
          </div>
          {showSignatureSetup && (
            <div className="signature-setup-form">
              <div className="signature-mode-tabs">
                <button
                  type="button"
                  className={signatureMode === 'draw' ? 'active' : ''}
                  onClick={() => setSignatureMode('draw')}
                >
                  Draw
                </button>
                <button
                  type="button"
                  className={signatureMode === 'type' ? 'active' : ''}
                  onClick={() => setSignatureMode('type')}
                >
                  Type
                </button>
              </div>
              {signatureMode === 'draw' ? (
                <>
                  <canvas
                    ref={signatureCanvasRef}
                    className="signature-canvas"
                    width="520"
                    height="150"
                    onPointerDown={beginSignatureDrawing}
                    onPointerMove={continueSignatureDrawing}
                    onPointerUp={() => setIsDrawingSignature(false)}
                    onPointerCancel={() => setIsDrawingSignature(false)}
                    aria-label="Draw your signature"
                  />
                  <button type="button" className="quiet-button" onClick={clearSignatureDrawing}>
                    Clear drawing
                  </button>
                </>
              ) : (
              <label>
                Type your full name
                <input
                  value={signatureDraft}
                  onChange={(event) => setSignatureDraft(event.target.value)}
                  placeholder="Jane Smith"
                  autoFocus
                />
              </label>
              )}
              <div className="signature-preview">{signatureDraft || 'Your signature'}</div>
              <div className="signature-actions">
                <button type="button" className="secondary-button" onClick={saveSignature}>
                  Save signature
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => setShowSignatureSetup(false)}
                >
                  Cancel
                </button>
              </div>
              {signatureMessage && <span className="signature-message">{signatureMessage}</span>}
            </div>
          )}
          <div className="document-toolbar">
            <span>Document view</span>
            <div className="zoom-controls">
              <button type="button" onClick={zoomOut} aria-label="Zoom out">−</button>
              <strong>{Math.round(zoom * 100)}%</strong>
              <button type="button" onClick={zoomIn} aria-label="Zoom in">+</button>
              <button type="button" className="zoom-reset" onClick={resetZoom}>Reset</button>
            </div>
          </div>
          <div className="pdf-stage signer-stage">
            <Document file={template.pdfDataUrl}>
              {Array.from(
                {
                  length:
                    template.pageCount ??
                    template.fields.reduce((highestPage, field) => Math.max(highestPage, field.page), 1),
                },
                (_, index) => {
                  const pageNumber = index + 1
                  return (
                    <div
                      className="pdf-page"
                      data-page-number={pageNumber}
                      key={pageNumber}
                    >
                      <Page pageNumber={pageNumber} width={500 * zoom} />
                      {template.fields
                        .filter((field) => field.page === pageNumber)
                        .map((field) => (
                          <label
                            key={field.id}
                            className={`signer-field field-${field.type} ${activeSignerFieldId === field.id ? 'signer-field-active' : ''}`}
                            style={{
                              left: `${field.x * zoom}px`,
                              top: `${field.y * zoom}px`,
                              width: `${field.width * zoom}px`,
                              height: `${field.height * zoom}px`,
                            }}
                          >
                            <span>{field.label}</span>
                            {field.type === 'signature' ? (
                              <button
                                type="button"
                                className="sign-here-button"
                                ref={(element) => {
                                  signerFieldRefs.current[field.id] = element
                                }}
                                onFocus={() => setActiveSignerFieldId(field.id)}
                                onClick={() => {
                                  if (!savedSignature) {
                                    setSignatureMessage('Set up your signature before signing.')
                                    setShowSignatureSetup(true)
                                    return
                                  }
                                  setSignerValues((current) => ({
                                    ...current,
                                    [field.id]: savedSignature,
                                  }))
                                }}
                              >
                                {signerValues[field.id]?.startsWith('data:image/png') ? (
                                  <img src={signerValues[field.id]} alt="Saved signature" />
                                ) : (
                                  signerValues[field.id] || 'Sign here'
                                )}
                              </button>
                            ) : field.type === 'checkbox' ? (
                              <input
                                type="checkbox"
                                ref={(element) => {
                                  signerFieldRefs.current[field.id] = element
                                }}
                                checked={signerValues[field.id] === 'true'}
                                onFocus={() => setActiveSignerFieldId(field.id)}
                                onChange={(event) =>
                                  setSignerValues((current) => ({
                                    ...current,
                                    [field.id]: String(event.target.checked),
                                  }))
                                }
                              />
                            ) : (
                              <input
                                type={field.type === 'date' ? 'date' : 'text'}
                                ref={(element) => {
                                  signerFieldRefs.current[field.id] = element
                                }}
                                required={field.required}
                                value={signerValues[field.id] ?? ''}
                                onFocus={() => setActiveSignerFieldId(field.id)}
                                onChange={(event) =>
                                  setSignerValues((current) => ({
                                    ...current,
                                    [field.id]: event.target.value,
                                  }))
                                }
                              />
                            )}
                          </label>
                        ))}
                    </div>
                  )
                },
              )}
            </Document>
          </div>
          <aside className="signer-disclosure">
            <strong>Electronic records notice</strong>
            <p>
              You may save or print this document and the completed signed copy. Your signature
              is associated with this request, its timestamp, and the email invitation used to
              access it. This notice is version {consentVersion}.
            </p>
            <div>
              <button type="button" className="quiet-button" onClick={() => window.print()}>
                Print or save notice
              </button>
              {supportEmail && (
                <a className="quiet-button" href={`mailto:${supportEmail}?subject=Paper copy request`}>
                  Request a paper copy
                </a>
              )}
            </div>
            <label className="consent-row">
              <input
                ref={consentRef}
                type="checkbox"
                checked={signerConsent}
                onChange={(event) => setSignerConsent(event.target.checked)}
              />
              <span>
                I authorize the use of my electronic signature and agree to the electronic records notice above.
              </span>
            </label>
          </aside>
          {submitMessage && !submissionComplete && <p className="submit-message">{submitMessage}</p>}
        </section>
      </div>
    )
  }

  if (authEnabled && authLoading) {
    return <div className="app-shell centered-message"><p>Checking admin session...</p></div>
  }

  if (authEnabled && !currentUser) {
    return (
      <div className="app-shell centered-message">
        <h1>Admin sign-in required</h1>
        <p>Sign in with Microsoft Entra ID to manage templates and requests.</p>
        <a className="primary-button auth-button" href={loginUrl()}>Sign in</a>
      </div>
    )
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

  if (!isEditorOpen) {
    return (
      <div className="app-shell dashboard-shell">
        <header className="topbar dashboard-header">
          <div>
            <p className="eyebrow">Document signing workspace</p>
            <h1>Published templates</h1>
          </div>
          <button type="button" className="primary-button" onClick={() => setIsEditorOpen(true)}>
            Create template
          </button>
          {authEnabled && currentUser && (
            <a className="quiet-button" href={logoutUrl()}>Sign out</a>
          )}
        </header>

        {publishedTemplates.length === 0 ? (
          <section className="empty-dashboard">
            <span className="empty-kicker">No templates yet</span>
            <h2>Start with a PDF template</h2>
            <p>Configure the fields once, then generate signing links whenever you need them.</p>
            <button type="button" className="secondary-button" onClick={() => setIsEditorOpen(true)}>
              Open template editor
            </button>
          </section>
        ) : (
          <section className="template-grid">
            {publishedTemplates.map((template) => {
              const link = templateLinks[template.templateId]
              return (
                <article className="template-card" key={template.templateId}>
                  <div className="template-card-topline">
                    <span className="template-status">Published</span>
                    <span>{template.fields.length} fields</span>
                  </div>
                  <h2>{template.name}</h2>
                  <p className="template-hash">SHA-256 {template.pdfHash.slice(0, 16)}...</p>
                  <div className="template-actions">
                    <input
                      className="recipient-email-input"
                      type="email"
                      placeholder="signer@example.com"
                      value={recipientEmail}
                      onChange={(event) => setRecipientEmail(event.target.value)}
                      aria-label="Signer email"
                    />
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => generateTemplateRequestLink(template)}
                    >
                      Generate signing link
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void openTemplateEditor(template)}>
                      Edit template
                    </button>
                  </div>
                  {link && (
                    <div className="generated-link-box">
                      <input readOnly value={link} aria-label="Generated signing link" />
                      <button type="button" className="secondary-button" onClick={() => copyTemplateLink(template.templateId)}>
                        Copy link
                      </button>
                      <span>
                        {apiEnabled
                          ? `Invitation sent to ${recipientEmail}`
                          : `Prepared for ${recipientEmail}. Send the link manually.`}
                      </span>
                      <span>Expires in 7 days</span>
                    </div>
                  )}
                </article>
              )
            })}
          </section>
        )}

        <section className="requests-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Lifecycle</p>
              <h2>Signing requests</h2>
            </div>
            <span>{signingRequests.length} total</span>
          </div>
          {signingRequests.length === 0 ? (
            <div className="requests-empty">Generated signing requests will appear here.</div>
          ) : (
            <div className="request-list">
              {signingRequests.map((request) => {
                const expired = isRequestExpired(request)
                const status = expired && request.status === 'sent' ? 'expired' : request.status
                const templateName = publishedTemplates.find(
                  (template) => template.templateId === request.templateId,
                )?.name ?? 'Published template'
                return (
                  <article className="request-row" key={request.requestId}>
                    <div>
                      <strong>{templateName}</strong>
                      <span className="request-recipient">
                        {request.recipientEmail ?? 'Manual link, no email recorded'}
                      </span>
                      <span>Created {new Date(request.createdAt).toLocaleString()}</span>
                    </div>
                    <span className={`request-status status-${status}`}>{status}</span>
                    <span className="request-expiry">Expires {new Date(request.expiresAt).toLocaleDateString()}</span>
                    {status === 'completed' && (apiEnabled || request.signedPdfDataUrl) && (
                      <button type="button" className="quiet-button" onClick={() => downloadCompletedDocument(request)}>
                        Download signed PDF
                      </button>
                    )}
                    {status !== 'completed' && status !== 'revoked' && (
                      <div className="request-row-actions">
                        <button
                          type="button"
                          className="quiet-button"
                          onClick={() => copyExistingRequestLink(request.requestId)}
                        >
                          Copy link
                        </button>
                        <button
                          type="button"
                          className="quiet-button"
                          onClick={() => revokeSigningRequest(request.requestId)}
                        >
                          Revoke
                        </button>
                        {apiEnabled && (
                          <>
                            <button type="button" className="quiet-button" onClick={() => resendRequest(request.requestId)}>Resend</button>
                            <button type="button" className="quiet-button" onClick={() => extendRequest(request.requestId)}>+7 days</button>
                          </>
                        )}
                      </div>
                    )}
                    {status === 'revoked' && (
                      <button
                        type="button"
                        className="quiet-button danger-action"
                        onClick={() => deleteRevokedRequest(request.requestId)}
                      >
                        Delete request
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Azure-hosted document workflow</p>
          <h1>DocuLnk</h1>
        </div>
        <div className="publish-area">
          <button type="button" className="secondary-button" onClick={() => setIsEditorOpen(false)}>
            Templates
          </button>
          <button type="button" className="primary-button" onClick={publishTemplate}>
            {isPublished ? 'Template published' : 'Publish template'}
          </button>
          {publishMessage && (
            <span className={isPublished ? 'publish-success' : 'publish-error'}>
              {publishMessage}
            </span>
          )}
        </div>
      </header>

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
            </div>
          </div>

          {file ? (
            <div className="pdf-stage">
              <Document
                file={file}
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
                      <Page pageNumber={pageNumber} width={500 * zoom} />
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
                            {field.label}
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
                  onChange={(event) =>
                    updateFieldForm('type', event.target.value as FieldType)
                  }
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

            <div className="row compact">
              <label>
                X
                <input
                  type="number"
                  value={fieldForm.x}
                  onChange={(event) =>
                    updateFieldForm('x', Number(event.target.value || 0))
                  }
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={fieldForm.y}
                  onChange={(event) =>
                    updateFieldForm('y', Number(event.target.value || 0))
                  }
                />
              </label>
            </div>

            <label>
              Page
              <input
                type="number"
                min="1"
                max={pdfPageCount || 1}
                value={fieldForm.page}
                onChange={(event) => updateFieldPage(Number(event.target.value || 1))}
              />
            </label>

            <div className="row compact">
              <label>
                W
                <input
                  type="number"
                  value={fieldForm.width}
                  onChange={(event) =>
                    updateFieldForm('width', Number(event.target.value || 0))
                  }
                />
              </label>
              <label>
                H
                <input
                  type="number"
                  value={fieldForm.height}
                  onChange={(event) =>
                    updateFieldForm('height', Number(event.target.value || 0))
                  }
                />
              </label>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={selectedFieldId ? saveFieldEdits : addField}
            >
              {selectedFieldId ? 'Save field changes' : 'Add field'}
            </button>
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
            <h3>Manual signing request</h3>
            <p>Generate a unique link, then send it to the signer yourself.</p>
            <button
              type="button"
              className="secondary-button"
              onClick={generateRequestLink}
              disabled={!isPublished}
            >
              Generate signing link
            </button>

            {requestLink && (
              <>
                <input className="request-link" readOnly value={requestLink} />
                <button type="button" className="secondary-button" onClick={copyRequestLink}>
                  {linkCopied ? 'Link copied' : 'Copy link'}
                </button>
                <span className="request-expiry">Expires {requestExpiresAt}</span>
              </>
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App
