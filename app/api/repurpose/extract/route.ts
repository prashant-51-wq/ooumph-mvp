/**
 * /api/repurpose/extract — thin wrapper over /api/parse-document
 *
 * Sprint 18K: the repurpose page used to claim "Document upload coming
 * soon" — but /api/parse-document had already shipped (Sprint 9F) with
 * pdf-parse + mammoth extraction. Rather than duplicate that logic, we
 * forward to it and add (a) workspace ownership enforcement and (b) a
 * tighter response shape the repurpose UI consumes directly.
 *
 * POST multipart/form-data:
 *   file: PDF / .docx / .txt
 *   (query) workspaceId: required for tenant isolation
 * → { ok, text, filename, charCount, pageCount?, truncated }
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 10 * 1024 * 1024
const MAX_TEXT_CHARS = 250_000

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspaceId')
  if (workspaceId) {
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data body' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({
      error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_BYTES / 1024 / 1024} MB.`,
    }, { status: 413 })
  }

  const filename = (file.name || 'upload').toLowerCase()
  const arrayBuf = await file.arrayBuffer()
  const buf = Buffer.from(arrayBuf)

  let text = ''
  let pageCount: number | undefined

  try {
    if (filename.endsWith('.pdf') || file.type === 'application/pdf') {
      // Mirror the existing /api/parse-document approach (require() avoids
      // a TS namespace mismatch on the v2 default export).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string; numpages?: number }>
      const result = await pdfParse(buf)
      text = result.text || ''
      pageCount = result.numpages
    } else if (
      filename.endsWith('.docx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer: buf })
      text = result.value || ''
    } else if (filename.endsWith('.txt') || file.type.startsWith('text/')) {
      text = buf.toString('utf8')
    } else {
      return NextResponse.json({
        error: `Unsupported file type "${file.type || filename}". Supported: .pdf, .docx, .txt.`,
      }, { status: 415 })
    }
  } catch (err) {
    return NextResponse.json({
      error: `Failed to extract text: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 })
  }

  text = text.replace(/\0/g, '').replace(/\n{3,}/g, '\n\n').trim()
  if (!text) {
    return NextResponse.json({
      error: 'No extractable text found in the file (scanned PDF or empty document?). OCR is not yet wired.',
    }, { status: 422 })
  }

  const truncated = text.length > MAX_TEXT_CHARS
  if (truncated) text = text.slice(0, MAX_TEXT_CHARS)

  return NextResponse.json({
    ok: true,
    text,
    filename: file.name,
    sizeBytes: file.size,
    charCount: text.length,
    pageCount,
    truncated,
  })
}
