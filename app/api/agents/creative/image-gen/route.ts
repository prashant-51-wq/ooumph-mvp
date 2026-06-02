import { NextRequest, NextResponse } from 'next/server'
import { sql, newId } from '@/lib/db'
import { assertWorkspaceOwnership } from '@/lib/guards'
import { assertAgentRunQuota } from '@/lib/quota'
import { recordMediaAsset } from '@/lib/media-assets'
import { withCredentials } from '@/lib/credential-context'
import { getWorkspaceSecret } from '@/lib/secrets'

export const runtime = 'nodejs'

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
    // Sprint 15D (P2 #21): ownership + quota gates. Image-gen burns BYOK
    // dollars per call so an unguarded route is a runaway risk.
    const denied = assertWorkspaceOwnership(req, workspaceId)
    if (denied) return denied
    const overQuota = await assertAgentRunQuota(req, workspaceId)
    if (overQuota) return overQuota

    // Sprint 19G: read the OpenAI key from workspace_secrets (encrypted store
    // since Sprint 18B). The previous code read settings.openaiApiKey from
    // model_settings, which Sprint 18B moved OUT of that table — so saved
    // BYOK keys were always invisible to this route. Fall back to env if the
    // workspace hasn't set its own key.
    const ws = await sql`SELECT model_settings FROM workspaces WHERE id=${workspaceId}`
    const settings = (ws.rows[0]?.model_settings || {}) as Record<string, string>
    const openaiKey = (await getWorkspaceSecret(workspaceId, 'openai')) || process.env.OPENAI_API_KEY || ''

    if (!openaiKey) {
      return NextResponse.json({
        ok: false,
        error: 'OpenAI API key not configured. Add it in Settings → AI Assistants.',
        requiresSetup: true,
      })
    }

    // 2. Generate image — credentials are request-scoped via AsyncLocalStorage
    // so concurrent workspaces never see each other's API keys.
    const { generateImage, isOpenAIAvailable } = await import('@/lib/tools/openai')

    const result = await withCredentials(
      { OPENAI_API_KEY: openaiKey },
      async () => {
        if (!isOpenAIAvailable()) return null
        return generateImage(prompt, { size, quality, style })
      }
    )
    if (!result) {
      return NextResponse.json({ ok: false, error: 'Image generation failed. Check your OpenAI API key and try again.' }, { status: 500 })
    }

    // 3. Optionally upload to Cloudinary. Cloudinary creds live in the same
    // workspace settings; scope them just like the OpenAI call above.
    let cloudinaryUrl: string | undefined
    if (uploadToCloudinary) {
      try {
        const { uploadImageUrl, isCloudinaryAvailable } = await import('@/lib/tools/cloudinary')
        cloudinaryUrl = await withCredentials(
          {
            CLOUDINARY_CLOUD_NAME: settings.cloudinaryCloudName,
            CLOUDINARY_API_KEY: settings.cloudinaryApiKey,
            CLOUDINARY_API_SECRET: settings.cloudinaryApiSecret,
          },
          async () => {
            if (!isCloudinaryAvailable()) return undefined
            const uploaded = await uploadImageUrl(result.url, 'ooumph/generated')
            return uploaded?.secureUrl
          }
        )
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

    // Sprint 15D (P0 #4): dual-write into media_assets so the image shows
    // up in /dashboard/media-library and can be attached to scheduled posts.
    // Prefer the persistent Cloudinary URL when we have one — the DALL-E
    // url is short-lived (~2 hours) and would 404 in the post composer.
    const persistentUrl = cloudinaryUrl || result.url
    const mediaAssetId = await recordMediaAsset({
      workspaceId,
      url: persistentUrl,
      filename: prompt.slice(0, 80).replace(/[^a-z0-9-_ ]/gi, '-') + '.png',
      assetType: 'image',
      mimeType: 'image/png',
      sourceProvider: 'openai-dalle3',
      metadata: {
        artifactId,
        prompt,
        revisedPrompt: result.revisedPrompt,
        size,
        quality,
        style,
      },
    })

    return NextResponse.json({
      ok: true,
      imageUrl: result.url,
      revisedPrompt: result.revisedPrompt,
      cloudinaryUrl,
      artifactId,
      mediaAssetId,
    })
  } catch (error) {
    console.error('Image gen agent error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
