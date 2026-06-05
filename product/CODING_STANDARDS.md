# CODING_STANDARDS.md — How Claude Should Code This Project
## Ooumph: AI Marketing & Sales Agency OS

**Version:** 1.0  
**Rule:** Every coding task must reference these standards. Violations are bugs, not style preferences.

---

## The Most Important Rules (Non-Negotiable)

### 1. No Coding Before Documents Exist
Do not write code for a feature unless:
- The feature is in `PRD.md`
- The module is in `MODULE_MAP.md`
- The table (if any) is in `DATABASE_SCHEMA.md`
- The endpoint (if any) is in `API_CONTRACTS.md`
- The approval rule (if any) is in `APPROVAL_RULES.md`

If something is missing, flag it as an assumption and request a document update first.

### 2. No Changing Unrelated Files
Every task has a defined scope. Only modify files listed in the task's `allowed_files`.  
If you discover a related bug in another file, flag it — do not fix it in the same task.

### 3. No Fake Data in Production Code
- No hardcoded names like "Acme Corp", "John Doe", "My Agency"
- No hardcoded numbers that look like real metrics
- No hardcoded cost estimates presented as real
- `useState('Acme Corp')` is a bug, not a placeholder
- Empty defaults (`useState('')`) are correct for user-entered data

### 4. No Fake Success
- No `setTimeout(() => setSuccess(true), 1400)` — if something doesn't work, show that
- No spinner that resolves to success without a real API call
- No "Coming soon" button that silently does nothing — show disabled with reason

### 5. No Mark as Done Without Tests
A function is not done if it has no test. At minimum: one happy path + one error path.

---

## File Organization

```
ooumph-mvp/
├── app/
│   ├── api/           # API routes — one folder per resource
│   ├── dashboard/     # Dashboard pages — one folder per page
│   ├── login/
│   └── signup/
├── components/        # Shared React components
├── lib/
│   ├── agents/        # Individual agent logic
│   ├── hooks/         # React hooks
│   ├── tools/         # External API integrations
│   ├── auth.ts        # Auth helpers
│   ├── db.ts          # Database connection + schema init
│   ├── secrets.ts     # BYOK encryption/decryption
│   ├── guards.ts      # Ownership and permission checks
│   ├── seed-workspace.ts
│   ├── agent-stream.ts
│   ├── base-url.ts
│   └── use-agent-stream.ts
├── product/           # Source-of-truth documents (this folder)
└── __tests__/         # Test files
```

---

## API Route Standards

### Every API route MUST:

```typescript
// 1. Import guards
import { requireAuth, assertWorkspaceOwnership } from '@/lib/guards'

// 2. Wrap in try/catch
export async function GET(req: Request) {
  try {
    // 3. Authenticate first
    const { userId } = await requireAuth(req)
    
    // 4. Get workspaceId from URL params
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return Response.json({ error: 'workspaceId required' }, { status: 400 })
    
    // 5. Assert ownership (prevents IDOR)
    await assertWorkspaceOwnership(req, workspaceId)
    
    // 6. Scope ALL DB queries to workspace_id
    const rows = await sql`SELECT * FROM contacts WHERE workspace_id = ${workspaceId}`
    
    // 7. Return JSON
    return Response.json({ contacts: rows })
    
  } catch (err) {
    if (err instanceof Response) throw err  // Re-throw auth errors (401/403)
    console.error('[GET /api/crm]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### API routes MUST NOT:
- Return HTML on error (always JSON)
- Expose stack traces to client
- Return API key values
- Allow cross-workspace data access
- Create undocumented endpoints

---

## Database Standards

### Raw SQL Only (No ORM)
```typescript
// CORRECT — Neon tagged template (auto-parameterized, SQL injection safe)
const rows = await sql`SELECT * FROM contacts WHERE workspace_id = ${workspaceId} AND id = ${contactId}`

// WRONG — Never string concatenate
const rows = await sql`SELECT * FROM contacts WHERE workspace_id = '${workspaceId}'`  // INJECTION RISK
```

### Every table must have workspace_id
```sql
-- CORRECT
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ...
)

-- WRONG — no workspace_id
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  name TEXT,
  ...
)
```

### Never query without workspace_id
```typescript
// CORRECT
const contacts = await sql`SELECT * FROM contacts WHERE workspace_id = ${workspaceId}`

// WRONG — returns ALL contacts from all workspaces
const contacts = await sql`SELECT * FROM contacts`
```

---

## Security Standards

### Authentication
- Use `requireAuth(req)` on every protected route
- Never trust `userId` from the request body — always extract from session
- Session cookies: httpOnly, Secure, SameSite=Strict

### Encryption
- Never store API keys in plaintext
- Use `setWorkspaceSecret()` / `getWorkspaceSecret()` from `lib/secrets.ts`
- Never log decrypted keys
- Never include keys in API responses (boolean flags only)

### Input Validation
```typescript
// Validate required fields before DB operations
if (!email || typeof email !== 'string') {
  return Response.json({ error: 'email required' }, { status: 400 })
}

// Sanitize user input — strip unexpected fields
const { name, email, phone } = body  // Destructure only known fields
```

### Rate Limiting
- Auth routes: 5 login attempts per minute per IP
- Agent routes: use `assertAgentRunQuota()` before every agent run

---

## Agent Code Standards

### All Agent Routes Return SSE
```typescript
export async function POST(req: Request) {
  // ... auth checks ...
  
  const { stream, send, close } = await createAgentEventStream({ workspaceId, agentName: 'cmo' })
  
  // Start async work — DO NOT await here
  runAgentAsync(send, close, body)
  
  // Return stream immediately
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

### BYOK Key Resolution (Always)
```typescript
// CORRECT — Try workspace BYOK key first, fall back to platform key
const anthropicKey = await getWorkspaceSecret(workspaceId, 'anthropicApiKey') 
                     ?? process.env.ANTHROPIC_API_KEY

if (!anthropicKey) throw new Error('No Anthropic API key configured')
const anthropic = new Anthropic({ apiKey: anthropicKey })
```

### Internal URL Resolution
```typescript
// CORRECT — Always use getBaseUrl()
import { getBaseUrl } from '@/lib/base-url'
const url = `${getBaseUrl()}/api/agents/strategy`

// WRONG — Never hardcode
const url = 'http://localhost:3000/api/agents/strategy'  // Breaks in production
const url = 'https://api.example.com/api/...'            // Breaks everywhere
```

---

## Frontend Standards

### Persisted State Rules
```typescript
// CORRECT — usePersistedState for data that should survive navigation
const [messages, setMessages] = usePersistedState<Message[]>('cmo:messages', [GREETING])

// NEVER persist API keys or sensitive data to localStorage
// NEVER persist raw chat as "memory" — use /api/memory for structured learning
```

### Loading / Error / Empty States Required
Every page that fetches data MUST have three states:
```tsx
if (loading) return <SkeletonLoader />
if (error) return <ErrorState message={error} onRetry={reload} />
if (items.length === 0) return <EmptyState message="No items yet" cta={<CreateButton />} />
return <DataView items={items} />
```

### WidgetErrorBoundary on Complex Components
Any component that:
- Fetches external data
- Renders data from localStorage (could have stale types)
- Contains complex rendering logic

Must be wrapped:
```tsx
<WidgetErrorBoundary widgetName="Component Name">
  <ComplexComponent />
</WidgetErrorBoundary>
```

---

## What Claude Must Never Do

1. **Never create a new API endpoint** not listed in `API_CONTRACTS.md`
2. **Never create a new database table** not listed in `DATABASE_SCHEMA.md`
3. **Never modify auth.ts, secrets.ts, or guards.ts** without explicit task approval
4. **Never modify billing-related code** without explicit task approval
5. **Never change database migrations** destructively without approval
6. **Never store actual API key values** anywhere except `workspace_secrets.encrypted_value`
7. **Never mark a task complete** without the required tests
8. **Never use `any` type** in TypeScript without a documented reason
9. **Never skip workspace_id** in database queries
10. **Never call an API endpoint** not in `API_CONTRACTS.md` from frontend code

---

## Code Review Checklist (Before Every Commit)

- [ ] Only changed files listed in task scope
- [ ] No hardcoded fake data
- [ ] No console.log with sensitive data
- [ ] All new API routes have workspace_id enforcement
- [ ] All new tables have workspace_id foreign key
- [ ] No API keys in any response
- [ ] Error handling wraps every async operation
- [ ] TypeScript compiles without errors
- [ ] Tests written for new code
- [ ] No unrelated files changed
