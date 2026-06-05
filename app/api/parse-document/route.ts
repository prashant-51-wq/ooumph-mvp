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
import dns from 'dns/promises'
import { assertWorkspaceOwnership } from '@/lib/guards'

export const runtime = 'nodejs'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Sprint 18Z (audit pass #8 P1 #5): SSRF protection. Resolve the URL's
 * hostname and refuse if any A/AAAA record falls in a private / loopback /
 * link-local range. Blocks localhost, 127/8, 10/8, 172.16-31/12, 192.168/16,
 * 169.254/16 (AWS metadata), ::1, fc00::/7, fe80::/10.
 */
function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase()
  // Sprint 19F (audit pass #9 P2-2): also reject unspecified address ::
  if (v === '::' || v === '0:0:0:0:0:0:0:0') return true
  if (v === '::1' || v === '0:0:0:0:0:0:0:1') return true
  if (v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true
  // IPv4 (also catches ::ffff:1.2.3.4 mapped form)
  const m = v.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)/)
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10)
    if (a === 10) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 0) return true // 0.0.0.0/8 — current network
  }
  return false
}

async function isSafePublicHost(hostname: string): Promise<boolean> {
  const lc = hostname.toLowerCase()
  if (lc === 'localhost' || lc.endsWith('.local') || lc.endsWith('.internal')) return false
  // Reject literal IPs that are already private without DNS roundtrip.
  if (isPrivateIp(lc)) return false
  // Resolve and reject if any record is private.
  const v4 = await dns.resolve4(lc).catch(() => [] as string[])
  const v6 = await dns.resolve6(lc).catch(() => [] as string[])
  if (v4.length === 0 && v6.length === 0) return false // unresolvable
  for (const ip of [...v4, ...v6]) if (isPrivateIp(ip)) return false
  return true
}

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
    // Sprint 18Z (P1 #5): require workspace ownership + size cap.
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId query param required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
    }
    const declaredLength = parseInt(req.headers.get('content-length') || '0', 10)
    if (declaredLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `Upload exceeds ${MAX_UPLOAD_BYTES} bytes` }, { status: 413 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `File exceeds ${MAX_UPLOAD_BYTES} bytes` }, { status: 413 })
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
    // Sprint 18Z (P1 #5): SSRF — require ownership + DNS-resolve the host
    // and refuse any private/loopback/link-local IPs.
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId query param required' }, { status: 400 })
    }
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied

    const url = req.nextUrl.searchParams.get('url')
    if (!url) {
      return NextResponse.json({ error: 'url query param required' }, { status: 400 })
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only http(s) URLs supported' }, { status: 400 })
    }
    if (!(await isSafePublicHost(parsed.hostname))) {
      return NextResponse.json({ error: 'URL resolves to a private / loopback / unresolvable host' }, { status: 400 })
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
