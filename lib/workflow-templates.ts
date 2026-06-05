/**
 * lib/workflow-templates.ts (Sprint 16I P1 #23)
 *
 * Library of guided "nurture sequence" templates surfaced by the workflows
 * page's "Create from template" wizard. These compile to the same backend
 * node shapes consumed by lib/workflow-engine.ts (send_email, wait,
 * add_tag, notify, etc.) — see app/api/workflows/route.ts for the storage
 * format.
 *
 * Each template defines a sequence of *steps*; a step is either a fixed
 * action (wait/tag/notify) or a customizable email step the wizard
 * exposes a subject + body editor for. The wizard hands the user the
 * customized template, then POSTs it to /api/workflows with the chosen
 * trigger type so the row lives in the workflow list immediately.
 */

export type TriggerOption = {
  id: 'lead_captured' | 'form_submitted' | 'tag_added'
  label: string
  description: string
  defaultConfig?: Record<string, unknown>
}

export const WORKFLOW_TRIGGERS: TriggerOption[] = [
  {
    id: 'lead_captured',
    label: 'New lead captured',
    description: 'Fires when a new contact is created (forms, imports, API).',
  },
  {
    id: 'form_submitted',
    label: 'Form submitted',
    description: 'Fires when any landing-page form is submitted.',
  },
  {
    id: 'tag_added',
    label: 'Tag added',
    description: 'Fires when a specific tag is applied to a contact.',
    defaultConfig: { tag: '' },
  },
]

export type WorkflowTemplateEmailStep = {
  kind: 'email'
  /** Days from enrollment that this email is sent (0 = immediate) */
  dayOffset: number
  subject: string
  body: string
}

export type WorkflowTemplateStep =
  | WorkflowTemplateEmailStep
  | { kind: 'tag'; tag: string }
  | { kind: 'notify'; channel: 'slack' | 'in_app'; body: string }

export interface WorkflowTemplate {
  id: '5-day-welcome' | '7-day-reengagement' | '3-day-demo-followup'
  name: string
  description: string
  /** Default trigger if user doesn't pick one. */
  defaultTrigger: TriggerOption['id']
  steps: WorkflowTemplateStep[]
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: '5-day-welcome',
    name: '5-day welcome',
    description: 'Five-touch welcome sequence over a week. Introduces brand, sets expectations, and drives one CTA.',
    defaultTrigger: 'lead_captured',
    steps: [
      {
        kind: 'email',
        dayOffset: 0,
        subject: 'Welcome aboard — here is what to expect',
        body: 'Hi {{first_name}},\n\nThanks for joining! Over the next few days I will send you a few short notes covering what we do and how to get the most out of it.\n\nFirst things first — reply to this email if you have any questions. I read every reply.\n\nTalk soon,\nThe team',
      },
      { kind: 'tag', tag: 'welcome-sequence' },
      {
        kind: 'email',
        dayOffset: 2,
        subject: 'The #1 thing most new users miss',
        body: 'Quick tip {{first_name}} — most folks miss this when they first sign up:\n\n• Connect at least one integration\n• Set up your brand profile\n• Run the agent for a sample task\n\nThat unlocks roughly 80% of the value.',
      },
      {
        kind: 'email',
        dayOffset: 4,
        subject: 'A short story (and a small ask)',
        body: 'Wanted to share a quick win from a customer this week.\n\n[Insert customer story here]\n\nIf this rings a bell, reply and let me know — I love hearing what you are working on.',
      },
      {
        kind: 'email',
        dayOffset: 5,
        subject: 'Ready to go deeper?',
        body: 'Hey {{first_name}},\n\nIf the last few emails have been useful, we have a deeper walkthrough scheduled for this week. Grab a spot here: [link].\n\nNo pressure — happy to answer anything by email instead.',
      },
    ],
  },
  {
    id: '7-day-reengagement',
    name: '7-day re-engagement',
    description: 'Win-back flow for contacts that have gone quiet. Mixes value, social proof, and a clear "still want this?" question.',
    defaultTrigger: 'tag_added',
    steps: [
      {
        kind: 'email',
        dayOffset: 0,
        subject: 'Still useful?',
        body: 'Hi {{first_name}},\n\nNoticed it has been a bit since we last connected. No worries — I just wanted to check whether what we sent is still useful, or whether your priorities have shifted.\n\nA quick reply (even one word) helps me make sure the next emails are worth your time.',
      },
      {
        kind: 'email',
        dayOffset: 3,
        subject: 'Three quick wins our customers used last month',
        body: 'Here are three things customers have shipped recently using us:\n\n1. [Quick win one]\n2. [Quick win two]\n3. [Quick win three]\n\nAny of these resonate? Hit reply.',
      },
      {
        kind: 'email',
        dayOffset: 7,
        subject: 'Last note from me',
        body: 'Hey {{first_name}}, I will stop emailing if I do not hear back — totally understand.\n\nIf you are still interested, just reply and I will pick things back up. Otherwise, all the best with what you are building.',
      },
      { kind: 'notify', channel: 'in_app', body: 'Re-engagement sequence completed for {{first_name}}' },
    ],
  },
  {
    id: '3-day-demo-followup',
    name: '3-day demo follow-up',
    description: 'Fast follow-up after a demo or discovery call. Recap, address objections, and propose next step.',
    defaultTrigger: 'form_submitted',
    steps: [
      {
        kind: 'email',
        dayOffset: 0,
        subject: 'Quick recap from our call',
        body: 'Hey {{first_name}},\n\nThanks for the time today. Quick recap of what we covered:\n\n• [Pain point you raised]\n• [How we map to it]\n• [What we agreed as the next step]\n\nLet me know if I missed anything.',
      },
      {
        kind: 'email',
        dayOffset: 1,
        subject: 'A couple of resources you might find useful',
        body: 'Following up with the two links I mentioned:\n\n• [Resource one]\n• [Resource two]\n\nAnd if it is helpful, here is a short loom showing the workflow we discussed: [loom link].',
      },
      {
        kind: 'email',
        dayOffset: 3,
        subject: 'Where do you want to take this?',
        body: 'Hey {{first_name}},\n\nWanted to make sure this does not slip. Two paths forward:\n\n1. We set up a short pilot (~2 weeks)\n2. We loop back in a month when timing is better\n\nWhich one sounds right?',
      },
      { kind: 'notify', channel: 'slack', body: 'Demo follow-up sequence completed for {{first_name}}' },
    ],
  },
]

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find(t => t.id === id)
}

/**
 * Compile the customized template into the backend node array consumed by
 * the workflow engine. Mirrors the shape produced by `nodeToPayload` in
 * app/dashboard/workflows/page.tsx so the row plays nicely with the
 * existing DAG builder UI on subsequent edits.
 */
export function templateToWorkflowNodes(
  template: WorkflowTemplate,
  customized: Record<number, { subject: string; body: string }>,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  let nodeCounter = 0
  const nid = () => `tmpl${Date.now()}${(nodeCounter++).toString(36)}`

  // Always lead with the trigger node — the canvas requires one.
  out.push({ id: nid(), type: 'trigger' })

  let lastOffset = 0
  template.steps.forEach((step, idx) => {
    if (step.kind === 'email') {
      const delta = step.dayOffset - lastOffset
      if (delta > 0) {
        out.push({ id: nid(), type: 'wait', delay_minutes: 0, delay_hours: 0, delay_days: delta })
      }
      const customizedStep = customized[idx]
      out.push({
        id: nid(),
        type: 'send_email',
        subject: customizedStep?.subject ?? step.subject,
        body: customizedStep?.body ?? step.body,
      })
      lastOffset = step.dayOffset
    } else if (step.kind === 'tag') {
      out.push({ id: nid(), type: 'add_tag', tag: step.tag })
    } else if (step.kind === 'notify') {
      out.push({ id: nid(), type: 'notify', channel: step.channel, body: step.body })
    }
  })

  return out
}
