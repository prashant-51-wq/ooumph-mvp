# MEMORY_ARCHITECTURE.md — Self-Evolving Memory System
## Ooumph: AI Marketing & Sales Agency OS

**Version:** 1.0  
**Core Rule:** Never store raw chat as learning. Store structured, typed, reviewed memory.

---

## The Problem With Current Implementation

**Current state (BAD):**
```
usePersistedState<Message[]>('cmo:messages', [GREETING])
```
CMO chat messages are stored in `localStorage` as raw chat history.

**Why this is wrong (from both documents):**
- Raw chat is noisy, unstructured, and not usable as intelligence
- It includes failed attempts, half-thoughts, and user small talk
- It grows unbounded and crashes the tab (we had e.slice crashes from this)
- It cannot be reused across devices or team members
- It provides no learning signal to the system

**Correct approach:**
After any output is reviewed (approved or rejected), a structured memory item is extracted and stored in the `memory_items` table.

---

## Memory Architecture

### Memory Item Structure

Every memory item is typed, labeled, and reviewed before storage.

```typescript
interface MemoryItem {
  id: string
  workspace_id: string
  type: MemoryType
  content: string          // Structured description (NOT raw chat)
  applies_to: string       // "LinkedIn posts for B2B SaaS founders"
  confidence: 'low' | 'medium' | 'high'
  evidence: string         // Performance data if available
  source_artifact_id?: string
  source_approval_id?: string
  status: 'active' | 'archived'
  created_at: string
}

type MemoryType = 
  | 'winning_hook'          // Content angle that performed well
  | 'failed_pattern'        // What didn't work and why
  | 'brand_rule'            // Brand voice constraint
  | 'sales_pattern'         // Closed-won or closed-lost learning
  | 'audience_insight'      // ICP behavior/preference discovered
  | 'compliance_note'       // Regulatory issue encountered
  | 'performance_benchmark' // Baseline metrics for comparison
  | 'approved_template'     // Reusable content template
  | 'objection_response'    // Sales objection + effective response
  | 'competitor_intel'      // Competitor intelligence
```

---

## Memory Categories

### 1. Brand Memory
**What it stores:**
- Brand voice rules extracted from approved content
- Tone corrections (when user edits AI output significantly)
- Prohibited phrases or approaches discovered
- Approved content templates

**How it's created:**
- When user approves content without edits → `winning_hook` or `approved_template`
- When user rejects content → `failed_pattern`
- When user heavily edits content → `brand_rule` (what changed + why)

**Example:**
```
Type: brand_rule
Content: "Ooumph brand voice should avoid corporate jargon like 'leverage' and 'synergy'. 
         Use direct, conversational language. 'Use' not 'utilize'."
Applies to: All content
Confidence: high
Evidence: User rejected 3 consecutive outputs containing these words
```

### 2. Campaign Memory
**What it stores:**
- Campaign types that generated leads
- Subject lines with high open rates
- Ad creative angles that worked
- Hooks that went viral or performed above average

**How it's created:**
- After campaign performance data arrives (webhook or manual entry)
- If CTR > 2× account average → `winning_hook`
- If CTR < 0.5× account average → `failed_pattern`

**Example:**
```
Type: winning_hook
Content: "Pain-point specific subject lines outperform generic ones for this workspace.
         'Still struggling with X?' outperformed 'Check out our solution' by 3.2×"
Applies to: Email subject lines, B2B audience
Confidence: high
Evidence: Campaign A (4.1% CTR) vs Campaign B (1.3% CTR), same list, same send time
```

### 3. Sales Memory
**What it stores:**
- Closed-won patterns (what worked)
- Closed-lost patterns (why deals were lost)
- Objection responses that overcame objections
- Lead sources that convert to customers
- Meeting booking messages with high acceptance rates

**How it's created:**
- When deal moves to Closed Won → `sales_pattern` (positive)
- When deal moves to Closed Lost → `sales_pattern` (negative + reason)
- When objection is overcome → `objection_response`

**Example:**
```
Type: sales_pattern
Content: "B2B SaaS founders respond best to outreach that leads with competitor pain points,
         not product features. Opening with 'How are you handling [specific pain]?' generated
         2× more replies than 'I'd love to show you our product.'"
Applies to: Cold outreach, B2B SaaS audience
Confidence: medium
Evidence: 180 outreach emails sent, 23 replies from pain-point openers vs 11 from product openers
```

### 4. Audience Memory
**What it stores:**
- ICP behaviors discovered through campaigns
- Content format preferences by channel
- Best-performing posting times
- Engagement patterns by audience segment

### 5. Compliance Memory
**What it stores:**
- Claims that were flagged in compliance review
- Wordings that triggered legal review
- Platform policy violations encountered
- Successful compliance-safe alternatives

**Example:**
```
Type: compliance_note
Content: "The claim 'Increase leads by 300%' was blocked by compliance review.
         Replaced with 'Users report significant lead increases — see case studies.'
         This version passed review."
Applies to: Ad copy, landing pages
Confidence: high
```

---

## How Memory Gets Created

### Automatic Memory Creation

**Trigger 1: Approval with edits**
```
User approves artifact but makes edits before approving
→ Compare original vs edited version
→ Extract what changed
→ Create memory item: type='brand_rule' or 'approved_template'
```

**Trigger 2: Rejection with notes**
```
User rejects artifact with notes
→ Extract rejection reason from notes
→ Create memory item: type='failed_pattern'
→ Memory content = rejection reason + context
```

**Trigger 3: Campaign performance**
```
Campaign metrics arrive (via webhook or manual entry)
→ If performance > 2× baseline: create 'winning_hook' memory
→ If performance < 0.5× baseline: create 'failed_pattern' memory
```

**Trigger 4: Sales outcome**
```
Deal stage changes to Closed Won or Closed Lost
→ Extract what worked/failed from CRM activity history
→ Create 'sales_pattern' memory
```

### Memory API

```
POST /api/memory
{
  workspaceId: string,
  type: MemoryType,
  content: string,        // REQUIRED: structured description
  applies_to: string,     // REQUIRED: context for when to use
  confidence: string,     // low/medium/high
  evidence?: string,      // data supporting this memory
  source_artifact_id?: string
}
```

---

## How Memory Gets Used

### In CMO Agent Prompts

When CMO agent starts, it retrieves relevant memory items and includes them:

```
System prompt includes:

BRAND MEMORY (from memory_items WHERE type='brand_rule'):
- {content of brand rules}

WINNING PATTERNS (from memory_items WHERE type='winning_hook'):
- {content of winning hooks}

PATTERNS TO AVOID (from memory_items WHERE type='failed_pattern'):
- {content of failed patterns}

AUDIENCE INSIGHTS (from memory_items WHERE type='audience_insight'):
- {content of audience insights}

COMPLIANCE RULES (from memory_items WHERE type='compliance_note'):
- {content of compliance notes}
```

### Memory Retrieval Strategy

```typescript
// Get relevant memory for a specific task
async function getMemoryForTask(
  workspaceId: string,
  taskType: string,   // 'email_subject', 'ad_copy', 'sales_outreach', etc.
  limit: number = 10
): Promise<MemoryItem[]> {
  // Get active memory items ordered by confidence (high first), then recency
  // Filter by applies_to relevance
  // Return top N items
}
```

---

## Memory Confidence System

| Level | Meaning | Evidence Required |
|-------|---------|-------------------|
| low | Initial hypothesis | One data point or user edit |
| medium | Emerging pattern | 2–3 data points |
| high | Proven pattern | 5+ data points or very strong single result |

Confidence increases when:
- Same pattern confirmed in multiple campaigns
- User consistently approves content following this pattern
- Sales team confirms it works

Confidence decreases when:
- Counter-evidence appears
- User explicitly says "ignore this"
- Pattern stops working after successful streak

---

## What Memory Is NOT

Memory is never:
- Raw conversation logs
- Unreviewed AI output
- Personal data about specific individuals
- Information not related to marketing/sales performance
- Session state (input drafts, UI toggles)

Memory is always:
- Structured
- Typed (has a type field)
- Labeled (has applies_to field)
- Confidence-rated
- Sourced (linked to artifact, approval, or campaign)
