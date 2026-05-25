import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      workspaceId,
      prompt,
      size = '1024x1024',
      quality = 'standard',
      style = 'vivid',
      uploadToCloudinary = false,
    }: {
      workspaceId: string
      prompt: string
      size?: '1024x1024' | '1792x1024' | '1024x1792'
      quality?: 'standard' | 'hd'
      style?: 'vivid' | 'natural'
      uploadToCloudinary?: boolean
    } = body

    if (!workspaceId || !prompt) {
      return NextResponse.json({ error: 'workspaceId and prompt are required' }, { status: 400 })
    }

    // 1. Fetch workspace model_settings and inject API key
    const ws = await sql`SELECT model_settings FROM workspaces WHERE id=${workspaceId}`
    const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>

    if (!settings.openaiApiKey) {
      return NextResponse.json({
        ok: false,
        error: 'OpenAI API key not configured. Add it in Settings → AI Assistants.',
        requiresSetup: true,
      })
    }

    // Inject API key temporarily for tool functions
    process.env.OPENAI_API_KEY = settings.openaiApiKey

    // 2. Generate image
    const { generateImage, isOpenAIAvailable } = await import('@/lib/tools/openai')

    if (!isOpenAIAvailable()) {
      return NextResponse.json({
        ok: false,
        error: 'OpenAI API key not configured. Add it in Settings → AI Assistants.',
        requiresSetup: true,
      })
    }

    const result = await generateImage(prompt, { size, quality, style })
    if (!result) {
      return NextResponse.json({ ok: false, error: 'Image generation failed. Check your OpenAI API key and try again.' }, { status: 500 })
    }

    // 3. Optionally upload to Cloudinary
    let cloudinaryUrl: string | undefined
    if (uploadToCloudinary) {
      try {
        const { uploadImageUrl, isCloudinaryAvailable } = await import('@/lib/tools/cloudinary')
        if (isCloudinaryAvailable()) {
          const uploaded = await uploadImageUrl(result.url, 'ooumph/generated')
          if (uploaded) cloudinaryUrl = uploaded.secureUrl
        }
      } catch {
        // Cloudinary unavailable — continue without it
      }
    }

    // 4. Save artifact
    const artifactId = newId()
    const content = JSON.stringify({
      prompt,
      revisedPrompt: result.revisedPrompt,
      imageUrl: result.url,
      cloudinaryUrl,
      size,
      quality,
      style,
    })

    await sql`
      INSERT INTO artifacts (id, workspace_id, type, title, content_json, status, created_at)
      VALUES (
        ${artifactId},
        ${workspaceId},
        ${'generated_image'},
        ${prompt.slice(0, 200)},
        ${content},
        ${'approved'},
        NOW()
      )
    `

    return NextResponse.json({
      ok: true,
      imageUrl: result.url,
      revisedPrompt: result.revisedPrompt,
      cloudinaryUrl,
      artifactId,
    })
  } catch (error) {
    console.error('Image gen agent error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
