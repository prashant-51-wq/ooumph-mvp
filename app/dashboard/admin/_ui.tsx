/**
 * Shared UI primitives for the /dashboard/admin panel.
 * Tailwind-only, no extra deps.
 */
'use client'

import { ReactNode } from 'react'

export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'default' | 'good' | 'bad' | 'warn' | 'info'
}) {
  const toneCls =
    tone === 'good' ? 'text-emerald-400' :
    tone === 'bad' ? 'text-red-400' :
    tone === 'warn' ? 'text-amber-400' :
    tone === 'info' ? 'text-indigo-400' :
    'text-white'
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</p>
      {sub != null && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-t border-gray-800">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <div className="h-3 bg-gray-800 rounded animate-pulse" style={{ width: `${60 + ((r + c) * 11) % 40}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

export function EmptyState({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <div className="py-12 text-center">
      {icon && <div className="mb-2 text-gray-600 flex justify-center">{icon}</div>}
      <p className="text-white font-semibold text-sm">{title}</p>
      {body && <p className="text-gray-500 text-xs mt-1 max-w-md mx-auto">{body}</p>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${className}`}>{children}</div>
  )
}

export function Badge({
  children,
  tone = 'gray',
}: {
  children: ReactNode
  tone?: 'gray' | 'green' | 'red' | 'amber' | 'indigo' | 'blue'
}) {
  const map: Record<string, string> = {
    gray: 'bg-gray-800 text-gray-300 border-gray-700',
    green: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
    red: 'bg-red-900/40 text-red-300 border-red-800',
    amber: 'bg-amber-900/40 text-amber-300 border-amber-800',
    indigo: 'bg-indigo-900/40 text-indigo-300 border-indigo-800',
    blue: 'bg-blue-900/40 text-blue-300 border-blue-800',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${map[tone]}`}>
      {children}
    </span>
  )
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '0'
  return n.toLocaleString('en-US')
}

export function fmtMoney(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) return '$0'
  const dollars = cents / 100
  if (Math.abs(dollars) >= 10000) return `$${(dollars / 1000).toFixed(1)}K`
  return `$${dollars.toFixed(2)}`
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso).getTime()
    const diff = Date.now() - d
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

export function PageSection({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      {(title || action) && (
        <div className="flex items-center justify-between">
          {title && <h3 className="text-sm font-semibold text-white">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full sm:w-72 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
    />
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
}) {
  const last = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex items-center justify-between px-2 py-3 text-xs text-gray-500">
      <span>
        {from}–{to} of {fmtNum(total)}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-2.5 py-1 rounded border border-gray-800 disabled:opacity-40 hover:bg-gray-800"
        >Prev</button>
        <span className="text-gray-400">Page {page} / {last}</span>
        <button
          onClick={() => onPage(Math.min(last, page + 1))}
          disabled={page >= last}
          className="px-2.5 py-1 rounded border border-gray-800 disabled:opacity-40 hover:bg-gray-800"
        >Next</button>
      </div>
    </div>
  )
}
