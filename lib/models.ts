// Client-safe model definitions (no SDK imports)
export const SUPPORTED_MODELS = [
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Best balance of speed and quality (recommended)' },
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', description: 'Most powerful — best for complex strategy tasks' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fastest — best for quick content tasks' },
]
export const DEFAULT_MODEL = 'claude-sonnet-4-6'
