import { pdfjs } from 'react-pdf'

// Imported for its side effect; must run before any <Document> mounts.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()
