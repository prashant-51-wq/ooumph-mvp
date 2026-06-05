'use client'

/**
 * components/Skeleton.tsx — Sprint 20P
 *
 * Tiny set of skeleton primitives for the dashboard widgets. Plain
 * Tailwind utilities — no new dep. Used INSTEAD of the previous
 * "0 / —" placeholder text that made the dashboard look like it
 * was full of empty data when it was actually still loading.
 *
 * The `animate-pulse` class is from Tailwind and works in every
 * modern browser without a vendor prefix dance.
 *
 * Variants
 * --------
 *   <Skeleton />           — 1-line text bar
 *   <Skeleton lines={3} /> — multi-line text block
 *   <SkeletonCard />       — full card-shaped placeholder
 *   <SkeletonStat />       — placeholder shaped like a KPI tile
 */

import React from 'react'

interface SkeletonProps {
  /** Number of pulsing bars stacked vertically. Default 1. */
  lines?: number
  /** Override the bar width via a Tailwind class. Default w-full. */
  widthClass?: string
  className?: string
}

export function Skeleton({ lines = 1, widthClass = 'w-full', className = '' }: SkeletonProps): React.ReactElement {
  if (lines === 1) {
    return <div className={`h-3 ${widthClass} bg-gray-800 rounded animate-pulse ${className}`} />
  }
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-3 ${i === lines - 1 ? 'w-2/3' : widthClass} bg-gray-800 rounded animate-pulse`}
        />
      ))}
    </div>
  )
}

/** Card-sized skeleton — use for widgets like Quick Stats tiles. */
export function SkeletonCard({ className = '' }: { className?: string }): React.ReactElement {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${className}`}>
      <Skeleton widthClass="w-1/3" />
      <div className="mt-3">
        <Skeleton widthClass="w-1/2" className="h-6" />
      </div>
      <div className="mt-2">
        <Skeleton widthClass="w-2/3" />
      </div>
    </div>
  )
}

/** Compact KPI tile shape — matches the Quick Stats grid items. */
export function SkeletonStat({ className = '' }: { className?: string }): React.ReactElement {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-3 ${className}`}>
      <div className="h-2 w-12 bg-gray-800 rounded animate-pulse" />
      <div className="h-5 w-8 bg-gray-800 rounded animate-pulse mt-2" />
      <div className="h-2 w-16 bg-gray-800 rounded animate-pulse mt-2" />
    </div>
  )
}

/** Row of N stat tiles. Used while Quick Stats is loading. */
export function SkeletonStatRow({ count = 4, className = '' }: { count?: number; className?: string }): React.ReactElement {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStat key={i} />
      ))}
    </div>
  )
}

/**
 * Table-body skeleton — renders `rows` pulsing rows each with `cols`
 * cells. Drop this inside a <tbody> to hold layout while data loads.
 * Also exported as a standalone div (non-table) via `standalone` prop
 * for use in list views that aren't actual <table> elements.
 */
export function SkeletonTableBody({
  rows = 5,
  cols = 4,
  standalone = false,
  className = '',
}: {
  rows?: number
  cols?: number
  standalone?: boolean
  className?: string
}): React.ReactElement {
  const widths = ['w-full', 'w-3/4', 'w-5/6', 'w-2/3', 'w-4/5']
  if (standalone) {
    return (
      <div className={`space-y-2 px-4 py-3 ${className}`}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-800/50 last:border-0">
            {Array.from({ length: cols }).map((__, j) => (
              <div
                key={j}
                className={`h-3 ${widths[(i + j) % widths.length]} bg-gray-800 rounded animate-pulse flex-1`}
              />
            ))}
          </div>
        ))}
      </div>
    )
  }
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-gray-800/50 last:border-0">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div className={`h-3 ${widths[(i + j) % widths.length]} bg-gray-800 rounded animate-pulse`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
