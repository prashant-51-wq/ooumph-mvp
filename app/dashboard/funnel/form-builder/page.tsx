'use client'

import { useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormField {
  id: string
  type: 'text' | 'email' | 'phone' | 'dropdown' | 'checkbox' | 'textarea' | 'date'
  label: string
  placeholder: string
  required: boolean
  helpText: string
  options?: string[]
}

interface FormConfig {
  title: string
  submitText: string
  successMessage: string
  syncToCrm: boolean
  fields: FormField[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELD_TYPE_META: Record<FormField['type'], { label: string; icon: string; defaultPlaceholder: string }> = {
  text:     { label: 'Text Input',    icon: '✏️',  defaultPlaceholder: 'Enter text...' },
  email:    { label: 'Email',         icon: '📧',  defaultPlaceholder: 'you@example.com' },
  phone:    { label: 'Phone Number',  icon: '📞',  defaultPlaceholder: '+1 (555) 000-0000' },
  dropdown: { label: 'Dropdown',      icon: '▾',   defaultPlaceholder: 'Select an option' },
  checkbox: { label: 'Checkbox',      icon: '☑️',  defaultPlaceholder: '' },
  textarea: { label: 'Text Area',     icon: '📝',  defaultPlaceholder: 'Enter your message...' },
  date:     { label: 'Date Picker',   icon: '📅',  defaultPlaceholder: '' },
}

const FIELD_TYPES = Object.keys(FIELD_TYPE_META) as FormField['type'][]

function genId(): string {
  return 'fld_' + Math.random().toString(36).slice(2, 9)
}

const DEFAULT_FORM: FormConfig = {
  title: 'Contact Us',
  submitText: 'Submit',
  successMessage: 'Thank you! We\'ll be in touch shortly.',
  syncToCrm: true,
  fields: [
    { id: genId(), type: 'email',    label: 'Email Address', placeholder: 'you@example.com',         required: true,  helpText: '' },
    { id: genId(), type: 'text',     label: 'Full Name',     placeholder: 'Enter your name...',       required: false, helpText: '' },
    { id: genId(), type: 'textarea', label: 'Message',       placeholder: 'Enter your message...',    required: false, helpText: '' },
  ],
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PreviewField({ field }: { field: FormField }) {
  const meta = FIELD_TYPE_META[field.type]
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-800 mb-1">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {field.type === 'textarea' && (
        <textarea
          placeholder={field.placeholder}
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          readOnly
        />
      )}
      {field.type === 'dropdown' && (
        <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="">{field.placeholder || 'Select an option'}</option>
          {(field.options ?? ['Option 1', 'Option 2', 'Option 3']).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}
      {field.type === 'checkbox' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-indigo-600" readOnly />
          <span className="text-sm text-gray-700">{field.label}</span>
        </label>
      )}
      {field.type === 'date' && (
        <input
          type="date"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          readOnly
        />
      )}
      {!['textarea', 'dropdown', 'checkbox', 'date'].includes(field.type) && (
        <input
          type={field.type === 'phone' ? 'tel' : field.type}
          placeholder={field.placeholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          readOnly
        />
      )}
      {field.helpText && <p className="mt-1 text-xs text-gray-500">{field.helpText}</p>}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FormBuilderPage() {
  const [form, setForm] = useState<FormConfig>(DEFAULT_FORM)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<'field' | 'form'>('form')
  const [showPreview, setShowPreview] = useState(false)
  const [showEmbed, setShowEmbed] = useState(false)
  const [saved, setSaved] = useState(false)
  const [embedCopied, setEmbedCopied] = useState(false)

  const selectedField = form.fields.find(f => f.id === selectedId) ?? null

  // ── Field mutations ────────────────────────────────────────────────────────

  const addField = useCallback((type: FormField['type']) => {
    const meta = FIELD_TYPE_META[type]
    const newField: FormField = {
      id: genId(),
      type,
      label: meta.label,
      placeholder: meta.defaultPlaceholder,
      required: false,
      helpText: '',
      options: type === 'dropdown' ? ['Option 1', 'Option 2', 'Option 3'] : undefined,
    }
    setForm(prev => ({ ...prev, fields: [...prev.fields, newField] }))
    setSelectedId(newField.id)
    setRightTab('field')
  }, [])

  const deleteField = useCallback((id: string) => {
    setForm(prev => ({ ...prev, fields: prev.fields.filter(f => f.id !== id) }))
    setSelectedId(prev => (prev === id ? null : prev))
  }, [])

  const moveField = useCallback((id: string, dir: 'up' | 'down') => {
    setForm(prev => {
      const idx = prev.fields.findIndex(f => f.id === id)
      if (idx === -1) return prev
      const newFields = [...prev.fields]
      if (dir === 'up' && idx > 0) {
        [newFields[idx - 1], newFields[idx]] = [newFields[idx], newFields[idx - 1]]
      } else if (dir === 'down' && idx < newFields.length - 1) {
        [newFields[idx], newFields[idx + 1]] = [newFields[idx + 1], newFields[idx]]
      }
      return { ...prev, fields: newFields }
    })
  }, [])

  const updateField = useCallback(<K extends keyof FormField>(id: string, key: K, value: FormField[K]) => {
    setForm(prev => ({
      ...prev,
      fields: prev.fields.map(f => f.id === id ? { ...f, [key]: value } : f),
    }))
  }, [])

  const updateForm = useCallback(<K extends keyof Omit<FormConfig, 'fields'>>(key: K, value: FormConfig[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }, [])

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const EMBED_CODE = `<script src="https://app.ooumph.ai/embed/form.js"
        data-form-id="form_XXXXX"
        data-workspace="YOUR_WORKSPACE_ID">
</script>`

  const handleCopyEmbed = () => {
    void navigator.clipboard.writeText(EMBED_CODE)
    setEmbedCopied(true)
    setTimeout(() => setEmbedCopied(false), 2000)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-950 min-h-screen">
      {/* Page header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-800 flex-shrink-0">
        <h1 className="text-2xl font-bold text-white">📋 Form Builder</h1>
        <p className="text-gray-400 text-sm mt-1">Build lead capture forms and embed them anywhere.</p>
      </div>

      {/* 3-column workspace */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: field palette ──────────────────────────────────── */}
        <aside className="w-48 border-r border-gray-800 bg-gray-900 flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Field Types</p>
          </div>
          <div className="p-2 space-y-1">
            {FIELD_TYPES.map(type => {
              const meta = FIELD_TYPE_META[type]
              return (
                <button
                  key={type}
                  onClick={() => addField(type)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-800 transition-colors text-left group"
                >
                  <span className="text-base flex-shrink-0">{meta.icon}</span>
                  <span className="flex-1 truncate">{meta.label}</span>
                  <span className="text-gray-600 group-hover:text-indigo-400 text-xs flex-shrink-0">+ Add</span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* ── Center panel: form canvas ──────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-gray-950 p-6">
          {form.fields.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-24">
              <span className="text-5xl mb-4">📋</span>
              <p className="text-gray-400 text-lg font-medium">Your form is empty</p>
              <p className="text-gray-600 text-sm mt-1">Click a field type on the left to add fields.</p>
            </div>
          ) : (
            <div className="max-w-xl mx-auto space-y-3">
              <p className="text-xs text-gray-600 uppercase tracking-wider font-semibold mb-2">{form.title}</p>
              {form.fields.map((field, idx) => {
                const meta = FIELD_TYPE_META[field.type]
                const isSelected = field.id === selectedId
                return (
                  <div
                    key={field.id}
                    onClick={() => { setSelectedId(field.id); setRightTab('field') }}
                    className={`bg-gray-900 rounded-xl border transition-all cursor-pointer p-4 ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500/40' : 'border-gray-800 hover:border-gray-700'}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Type badge */}
                      <span className="text-lg flex-shrink-0 mt-0.5">{meta.icon}</span>

                      {/* Label + placeholder editable */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <input
                          type="text"
                          value={field.label}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateField(field.id, 'label', e.target.value)}
                          className="w-full bg-transparent text-white text-sm font-medium border-b border-transparent hover:border-gray-700 focus:border-indigo-500 focus:outline-none transition-colors"
                          placeholder="Field label"
                        />
                        {!['checkbox', 'date'].includes(field.type) && (
                          <input
                            type="text"
                            value={field.placeholder}
                            onClick={e => e.stopPropagation()}
                            onChange={e => updateField(field.id, 'placeholder', e.target.value)}
                            className="w-full bg-gray-800 text-gray-500 text-xs rounded-lg px-3 py-1.5 border border-gray-700 focus:outline-none focus:border-indigo-500 transition-colors"
                            placeholder="Placeholder text..."
                          />
                        )}
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {/* Required toggle */}
                        <button
                          onClick={() => updateField(field.id, 'required', !field.required)}
                          title={field.required ? 'Required — click to make optional' : 'Optional — click to make required'}
                          className={`text-xs px-1.5 py-0.5 rounded font-medium transition-colors ${field.required ? 'bg-red-900/50 text-red-400 border border-red-800' : 'bg-gray-800 text-gray-600 border border-gray-700 hover:text-gray-400'}`}
                        >
                          {field.required ? 'REQ' : 'OPT'}
                        </button>
                        {/* Move up */}
                        <button
                          onClick={() => moveField(field.id, 'up')}
                          disabled={idx === 0}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors"
                        >↑</button>
                        {/* Move down */}
                        <button
                          onClick={() => moveField(field.id, 'down')}
                          disabled={idx === form.fields.length - 1}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors"
                        >↓</button>
                        {/* Delete */}
                        <button
                          onClick={() => deleteField(field.id)}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-700 hover:text-red-400 hover:bg-red-900/30 text-xs transition-colors"
                          title="Delete field"
                        >✕</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>

        {/* ── Right panel: settings ──────────────────────────────────────── */}
        <aside className="w-64 border-l border-gray-800 bg-gray-900 flex flex-col flex-shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-gray-800 flex-shrink-0">
            <button
              onClick={() => setRightTab('field')}
              className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${rightTab === 'field' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Field
            </button>
            <button
              onClick={() => setRightTab('form')}
              className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${rightTab === 'form' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Form
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Field settings */}
            {rightTab === 'field' && (
              <>
                {selectedField ? (
                  <>
                    <div>
                      <p className="text-xs text-gray-500 mb-1 font-medium">Type</p>
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <span>{FIELD_TYPE_META[selectedField.type].icon}</span>
                        <span>{FIELD_TYPE_META[selectedField.type].label}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1 font-medium">Label</label>
                      <input
                        type="text"
                        value={selectedField.label}
                        onChange={e => updateField(selectedField.id, 'label', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    {!['checkbox', 'date'].includes(selectedField.type) && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1 font-medium">Placeholder</label>
                        <input
                          type="text"
                          value={selectedField.placeholder}
                          onChange={e => updateField(selectedField.id, 'placeholder', e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs text-gray-500 mb-1 font-medium">Help Text</label>
                      <input
                        type="text"
                        value={selectedField.helpText}
                        onChange={e => updateField(selectedField.id, 'helpText', e.target.value)}
                        placeholder="Optional hint below the field"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-xs text-gray-400 font-medium">Required</label>
                      <button
                        onClick={() => updateField(selectedField.id, 'required', !selectedField.required)}
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${selectedField.required ? 'bg-indigo-600' : 'bg-gray-700'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${selectedField.required ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    {selectedField.type === 'dropdown' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1 font-medium">Options (one per line)</label>
                        <textarea
                          rows={5}
                          value={(selectedField.options ?? []).join('\n')}
                          onChange={e => updateField(selectedField.id, 'options', e.target.value.split('\n').filter(Boolean))}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-600 text-sm text-center py-8">Select a field on the canvas to edit its settings.</p>
                )}
              </>
            )}

            {/* Form settings */}
            {rightTab === 'form' && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 font-medium">Form Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => updateForm('title', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1 font-medium">Submit Button Text</label>
                  <input
                    type="text"
                    value={form.submitText}
                    onChange={e => updateForm('submitText', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1 font-medium">Success Message</label>
                  <textarea
                    rows={3}
                    value={form.successMessage}
                    onChange={e => updateForm('successMessage', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none transition-colors"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 font-medium">Sync leads to CRM</p>
                    <p className="text-xs text-gray-600 mt-0.5">Auto-add submissions to CRM</p>
                  </div>
                  <button
                    onClick={() => updateForm('syncToCrm', !form.syncToCrm)}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.syncToCrm ? 'bg-indigo-600' : 'bg-gray-700'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.syncToCrm ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="pt-2 border-t border-gray-800">
                  <p className="text-xs text-gray-600">{form.fields.length} field{form.fields.length !== 1 ? 's' : ''} · {form.fields.filter(f => f.required).length} required</p>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* ── Bottom action bar ──────────────────────────────────────────────────── */}
      <div className="border-t border-gray-800 bg-gray-900 px-6 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => setShowPreview(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium transition-colors border border-gray-700"
        >
          <span>👁️</span> Preview
        </button>
        <button
          onClick={() => setShowEmbed(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium transition-colors border border-gray-700"
        >
          <span>{'</>'}</span> Copy embed code
        </button>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          {saved ? '✓ Saved!' : '💾 Save Form'}
        </button>
      </div>

      {/* ── Preview Modal ──────────────────────────────────────────────────────── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">{form.title}</h2>
              <button
                onClick={() => setShowPreview(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg"
              >✕</button>
            </div>
            <div className="px-6 py-5">
              {form.fields.map(field => (
                <PreviewField key={field.id} field={field} />
              ))}
              <button className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                {form.submitText}
              </button>
              <p className="text-xs text-center text-gray-400 mt-3 italic">{form.successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Embed Code Modal ───────────────────────────────────────────────────── */}
      {showEmbed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">Embed Code</h2>
              <button
                onClick={() => setShowEmbed(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-lg"
              >✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-400">Paste this snippet wherever you want your form to appear — any HTML page, Webflow, WordPress, etc.</p>
              <pre className="bg-gray-950 border border-gray-800 rounded-xl p-4 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all">
                {EMBED_CODE}
              </pre>
              <button
                onClick={handleCopyEmbed}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
              >
                {embedCopied ? '✓ Copied!' : '📋 Copy to clipboard'}
              </button>
              <p className="text-xs text-gray-600 text-center">Replace <code className="text-indigo-400">YOUR_WORKSPACE_ID</code> with your actual workspace ID from Settings.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
