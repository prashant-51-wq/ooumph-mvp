# DATABASE_SCHEMA.md — Canonical Database Schema
## Ooumph: AI Marketing & Sales Agency OS

**Version:** 1.0  
**Rule:** No new table may be created without updating this document first.  
**Rule:** Every table that holds workspace data MUST have `workspace_id` as a foreign key.

---

## Core Principle

Every tenant-owned table includes `workspace_id`. This is non-negotiable.  
Queries without `workspace_id` filter are a security bug, not a missing feature.

---

## AUTH & USER TABLES

### users
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| email | TEXT UNIQUE NOT NULL | |
| password_hash | TEXT NOT NULL | bcrypt, 12 rounds |
| full_name | TEXT DEFAULT '' | |
| avatar_url | TEXT DEFAULT '' | |
| is_admin | BOOLEAN DEFAULT FALSE | Super admin flag |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

### sessions
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| user_id | TEXT → users.id | ON DELETE CASCADE |
| token_hash | TEXT UNIQUE NOT NULL | HMAC-SHA256 of token bytes |
| device | TEXT DEFAULT '' | User-agent extracted |
| ip | TEXT DEFAULT '' | X-Forwarded-For |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| expires_at | TIMESTAMPTZ NOT NULL | 30 days from creation |

### login_events
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| user_id | TEXT → users.id | ON DELETE SET NULL |
| device | TEXT DEFAULT '' | |
| ip | TEXT DEFAULT '' | |
| success | BOOLEAN NOT NULL | |
| failure_reason | TEXT DEFAULT '' | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

---

## WORKSPACE TABLES

### workspaces
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | Display name |
| owner_id | TEXT → users.id | ON DELETE CASCADE |
| business_name | TEXT DEFAULT '' | |
| industry | TEXT DEFAULT '' | |
| website | TEXT DEFAULT '' | |
| tagline | TEXT DEFAULT '' | |
| offer | TEXT DEFAULT '' | Primary offer/product |
| unique_value | TEXT DEFAULT '' | USP |
| target_audience | TEXT DEFAULT '' | ICP description |
| tone | TEXT DEFAULT 'Professional' | Brand voice |
| competitors | TEXT DEFAULT '' | Competitor names |
| channels | JSONB DEFAULT '[]' | Active marketing channels |
| goals | TEXT DEFAULT '' | Business goals |
| monthly_budget | TEXT DEFAULT '' | Marketing budget |
| prohibited_claims | TEXT DEFAULT '' | Claims AI cannot make |
| approval_email | TEXT DEFAULT '' | Who receives approval notifications |
| model_settings | JSONB DEFAULT '{}' | AI model config (NO API KEYS) |
| plan_tier | TEXT DEFAULT 'starter' | starter/growth/agency/enterprise |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

### workspace_secrets
**Purpose:** AES-256-GCM encrypted BYOK API keys. NEVER stored in workspaces.model_settings.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| key_name | TEXT NOT NULL | anthropicApiKey, openaiApiKey, etc. |
| encrypted_value | TEXT NOT NULL | base64(iv):base64(cipher):base64(tag) |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| UNIQUE | (workspace_id, key_name) | One key per provider per workspace |

### workspace_projects
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| name | TEXT NOT NULL | |
| status | TEXT DEFAULT 'active' | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

---

## AGENT TABLES

### agents
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| name | TEXT NOT NULL | Slug: cmo, content-sup, etc. |
| display_name | TEXT NOT NULL | Human-readable name |
| status | TEXT DEFAULT 'active' | active/paused/error/disabled |
| daily_quota | INTEGER DEFAULT 50 | Max runs per day |
| cost_cap_per_run | DECIMAL(10,4) DEFAULT 1.00 | USD |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| UNIQUE | (workspace_id, name) | |

### agent_runs
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| agent_name | TEXT NOT NULL | Slug of the agent |
| status | TEXT DEFAULT 'pending' | pending/running/completed/failed |
| input_json | JSONB DEFAULT '{}' | What was sent to the agent |
| output_json | JSONB DEFAULT '{}' | What the agent returned |
| cost_estimate | DECIMAL(10,6) DEFAULT 0 | USD |
| parent_run_id | TEXT → agent_runs.id | For sub-agent chains |
| error_message | TEXT DEFAULT '' | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| completed_at | TIMESTAMPTZ | NULL until done |

---

## CONTENT & APPROVAL TABLES

### artifacts
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| type | TEXT NOT NULL | strategy/blog_post/social_post/email_draft/ad_copy/etc. |
| title | TEXT DEFAULT 'Untitled' | |
| content_json | JSONB DEFAULT '{}' | Structured content |
| status | TEXT DEFAULT 'draft' | draft/pending_approval/approved/rejected |
| created_by_agent | TEXT DEFAULT '' | Agent slug |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

### approvals
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| artifact_id | TEXT → artifacts.id | ON DELETE CASCADE |
| artifact_type | TEXT NOT NULL | |
| artifact_title | TEXT DEFAULT '' | |
| content_json | JSONB DEFAULT '{}' | Snapshot of content at approval time |
| status | TEXT DEFAULT 'pending' | pending/approved/rejected |
| brand_voice_score | INTEGER | 0–100 |
| brand_voice_reasoning | JSONB DEFAULT '[]' | Array of scoring reasons |
| approved_by | TEXT DEFAULT '' | User ID or email |
| approved_at | TIMESTAMPTZ | |
| notes | TEXT DEFAULT '' | Rejection notes |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

---

## CRM TABLES

### contacts
**Critical:** Must have consent and do-not-contact fields from day one.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| name | TEXT NOT NULL | |
| email | TEXT DEFAULT '' | |
| phone | TEXT DEFAULT '' | |
| company | TEXT DEFAULT '' | |
| title | TEXT DEFAULT '' | Job title |
| stage | TEXT DEFAULT 'lead' | lead/prospect/qualified/proposal/customer/churned |
| rfm_tier | TEXT DEFAULT '' | Champion/Loyal/AtRisk/Lost/New/Promising |
| lead_score | INTEGER DEFAULT 0 | 0–100 |
| fit_score | INTEGER DEFAULT 0 | ICP match 0–100 |
| intent_score | INTEGER DEFAULT 0 | Buying intent 0–100 |
| lead_source | TEXT DEFAULT '' | form/organic/ad/referral/outreach |
| tags | JSONB DEFAULT '[]' | |
| deal_value | DECIMAL(12,2) DEFAULT 0 | |
| deal_probability | INTEGER DEFAULT 0 | |
| **consent_status** | TEXT DEFAULT 'not_set' | **opted_in/opted_out/not_set** |
| **consent_channel** | TEXT DEFAULT '' | **email/sms/phone** |
| **consent_date** | TIMESTAMPTZ | **When consent was given** |
| **do_not_contact** | BOOLEAN DEFAULT FALSE | **Hard stop — never contact** |
| **unsubscribed_at** | TIMESTAMPTZ | **When they unsubscribed** |
| last_activity_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

### deals
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| contact_id | TEXT → contacts.id | ON DELETE SET NULL |
| name | TEXT NOT NULL | |
| stage | TEXT DEFAULT 'lead' | |
| value | DECIMAL(12,2) DEFAULT 0 | |
| probability | INTEGER DEFAULT 0 | |
| lost_reason | TEXT DEFAULT '' | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| closed_at | TIMESTAMPTZ | |

### lead_activities
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| contact_id | TEXT → contacts.id | ON DELETE CASCADE |
| type | TEXT NOT NULL | call/email/meeting/note/deal_update |
| title | TEXT NOT NULL | |
| description | TEXT DEFAULT '' | |
| outcome | TEXT DEFAULT '' | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

### segments
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| name | TEXT NOT NULL | |
| description | TEXT DEFAULT '' | |
| rules | JSONB DEFAULT '{}' | Segmentation rules |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

---

## SALES AGENT TABLES (MISSING — Must Build)

### sales_handoffs
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| contact_id | TEXT → contacts.id | |
| assigned_rep | TEXT DEFAULT '' | Sales rep user ID or email |
| handoff_packet | JSONB DEFAULT '{}' | Full lead context for sales rep |
| status | TEXT DEFAULT 'pending' | pending/accepted/completed/declined |
| meeting_booking_draft | TEXT DEFAULT '' | Drafted booking message |
| notes | TEXT DEFAULT '' | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| completed_at | TIMESTAMPTZ | |

### objection_log
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| contact_id | TEXT → contacts.id | |
| objection | TEXT NOT NULL | |
| suggested_response | TEXT DEFAULT '' | |
| outcome | TEXT DEFAULT '' | overcame/did_not_overcome |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

---

## PUBLISHING TABLES

### scheduled_content
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| platform | TEXT NOT NULL | instagram/facebook/twitter/linkedin/tiktok/youtube |
| content_body | TEXT NOT NULL | |
| media_urls | JSONB DEFAULT '[]' | |
| scheduled_at | TIMESTAMPTZ | |
| status | TEXT DEFAULT 'pending' | pending/published/failed/draft |
| published_at | TIMESTAMPTZ | |
| error | TEXT DEFAULT '' | |
| artifact_id | TEXT → artifacts.id | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

---

## EMAIL MARKETING TABLES

### email_lists
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| name | TEXT NOT NULL | |
| description | TEXT DEFAULT '' | |
| from_name | TEXT DEFAULT '' | |
| from_email | TEXT DEFAULT '' | |
| double_opt_in | BOOLEAN DEFAULT FALSE | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

### email_subscribers
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| list_id | TEXT → email_lists.id | ON DELETE CASCADE |
| email | TEXT NOT NULL | |
| name | TEXT DEFAULT '' | |
| status | TEXT DEFAULT 'subscribed' | subscribed/unsubscribed/bounced |
| consent | BOOLEAN DEFAULT FALSE | |
| bounce_count | INTEGER DEFAULT 0 | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| UNIQUE | (list_id, email) | |

### email_campaigns
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| list_id | TEXT → email_lists.id | |
| name | TEXT NOT NULL | |
| subject | TEXT DEFAULT '' | |
| body_html | TEXT DEFAULT '' | |
| status | TEXT DEFAULT 'draft' | draft/approved/sending/sent/failed |
| sent_count | INTEGER DEFAULT 0 | |
| open_count | INTEGER DEFAULT 0 | |
| click_count | INTEGER DEFAULT 0 | |
| bounce_count | INTEGER DEFAULT 0 | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| sent_at | TIMESTAMPTZ | |

---

## ANALYTICS TABLES

### daily_stats
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| date | DATE NOT NULL | |
| content_published | INTEGER DEFAULT 0 | |
| engagement | INTEGER DEFAULT 0 | |
| leads | INTEGER DEFAULT 0 | |
| reach | INTEGER DEFAULT 0 | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| UNIQUE | (workspace_id, date) | |

---

## MEMORY TABLES

### memory_items
**IMPORTANT:** Never insert raw chat text. Always typed, labeled, reviewed.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| type | TEXT NOT NULL | winning_hook/failed_pattern/brand_rule/sales_pattern/audience_insight/compliance_note/performance_benchmark |
| content | TEXT NOT NULL | Structured description |
| applies_to | TEXT DEFAULT '' | e.g., "LinkedIn posts for B2B SaaS founders" |
| confidence | TEXT DEFAULT 'medium' | low/medium/high |
| evidence | TEXT DEFAULT '' | Performance data supporting this memory |
| source_artifact_id | TEXT → artifacts.id | |
| source_approval_id | TEXT | |
| status | TEXT DEFAULT 'active' | active/archived |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

---

## NOTIFICATION & SYSTEM TABLES

### notifications
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| type | TEXT NOT NULL | lead_captured/post_published/publish_failed/approval_pending/agent_run_failed/budget_alert/sales_handoff_ready |
| title | TEXT NOT NULL | |
| body | TEXT DEFAULT '' | |
| link | TEXT DEFAULT '' | Deep link to relevant page |
| severity | TEXT DEFAULT 'info' | info/success/warning/error |
| read | BOOLEAN DEFAULT FALSE | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

### integrations
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| provider | TEXT NOT NULL | meta/google/linkedin/twitter/klaviyo/stripe/etc. |
| access_token | TEXT DEFAULT '' | Encrypted |
| refresh_token | TEXT DEFAULT '' | Encrypted |
| expires_at | TIMESTAMPTZ | |
| scopes | JSONB DEFAULT '[]' | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| UNIQUE | (workspace_id, provider) | |

### compliance_checks
**MISSING TABLE — Must Add**

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| workspace_id | TEXT → workspaces.id | ON DELETE CASCADE |
| artifact_id | TEXT → artifacts.id | |
| check_type | TEXT NOT NULL | email_compliance/ad_claim/testimonial/ai_call/outreach |
| passed | BOOLEAN NOT NULL | |
| issues | JSONB DEFAULT '[]' | Array of compliance issues found |
| checked_at | TIMESTAMPTZ DEFAULT NOW() | |
