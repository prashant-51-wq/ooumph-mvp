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
