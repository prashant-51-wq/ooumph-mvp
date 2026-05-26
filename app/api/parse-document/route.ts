/**
 * /api/parse-document
 *
 * Extracts plain text from uploaded PDF / DOCX / TXT files, or scrapes a URL.
 *
 * POST (multipart/form-data):
 *   FormData: { file: File }
 *   → { text: string, type: 'pdf'|'docx'|'txt', filename: string }
 *
 * GET ?url=https://...
 *   → { text: string, type: 'url', filename: string }
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

async function extractPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>
  const data = await pdfParse(buffer)
  return data.text || ''
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value || ''
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const filename = file.name || 'upload'
    const lower = filename.toLowerCase()
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let text = ''
    let type: 'pdf' | 'docx' | 'txt' = 'txt'

    if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
      type = 'pdf'
      text = await extractPdf(buffer)
    } else if (
      lower.endsWith('.docx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      type = 'docx'
      text = await extractDocx(buffer)
    } else if (lower.endsWith('.txt') || file.type.startsWith('text/')) {
      type = 'txt'
      text = buffer.toString('utf-8')
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${filename}. Supported: PDF, DOCX, TXT.` },
        { status: 400 }
      )
    }

    text = text.trim()
    if (!text) {
      return NextResponse.json({ error: 'Document is empty or could not be parsed' }, { status: 422 })
    }

    return NextResponse.json({ text, type, filename, length: text.length })
  } catch (err) {
    console.error('[/api/parse-document POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse document' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get('url')
    if (!url) {
      return NextResponse.json({ error: 'url query param required' }, { status: 400 })
    }

    // Basic safety: only allow http(s)
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only http(s) URLs supported' }, { status: 400 })
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OoumphBot/1.0; +https://ooumph.com)',
        Accept: 'text/html,application/xhtml+xml,application/pdf,*/*',
      },
      // 20s timeout
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Fetch failed: ${res.status}` }, { status: 502 })
    }

    const ctype = res.headers.get('content-type') || ''
    let text = ''

    if (ctype.includes('application/pdf')) {
      const buffer = Buffer.from(await res.arrayBuffer())
      text = await extractPdf(buffer)
    } else if (
      ctype.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ) {
      const buffer = Buffer.from(await res.arrayBuffer())
      text = await extractDocx(buffer)
    } else {
      const html = await res.text()
      text = stripHtml(html)
    }

    text = text.trim().slice(0, 50_000) // cap for safety
    if (!text) {
      return NextResponse.json({ error: 'No text extracted from URL' }, { status: 422 })
    }

    return NextResponse.json({ text, type: 'url', filename: url, length: text.length })
  } catch (err) {
    console.error('[/api/parse-document GET]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to scrape URL' },
      { status: 500 }
    )
  }
}
