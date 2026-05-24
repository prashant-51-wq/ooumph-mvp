import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function PATCH(req: NextRequest) {
  try {
    const { artifactId, content_json } = await req.json()
    if (!artifactId || content_json === undefined) {
      return NextResponse.json({ error: 'Missing artifactId or content_json' }, { status: 400 })
    }
    await sql`UPDATE artifacts SET content_json = ${JSON.stringify(content_json)} WHERE id = ${artifactId}`
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
