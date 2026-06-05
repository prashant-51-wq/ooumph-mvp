'use client'

/**
 * components/WidgetErrorBoundary.tsx — Sprint 20P
 *
 * A LOCAL React error boundary for dashboard widgets. The
 * /app/dashboard/error.tsx segment-level boundary replaces the
 * entire dashboard layout with a recovery card — too aggressive
 * for the "one widget fetched bad data" case. This component
 * isolates the failure to just that widget so the rest of the
 * dashboard keeps working.
 *
 * Usage
 * -----
 *   <WidgetErrorBoundary widgetName="Quick Stats">
 *     <QuickStats workspaceId={wid} />
 *   </WidgetErrorBoundary>
 *
 * When the child throws during render, this component swaps in a
 * subtle inline card showing the widget name + a Retry button.
 * The Retry button increments a `retryKey` that remounts the child
 * subtree — useful when the failure was transient (network blip,
 * 502 from a sub-route).
 *
 * No external deps. ~80 lines.
 */

import React from 'react'

interface Props {
  /** Human-readable name shown in the failure card. */
  widgetName: string
  /** Optional callback fired on Retry — useful for triggering a
   *  parent-level data refetch in addition to the local remount. */
  onRetry?: () => void
  children: React.ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string | null
  retryKey: number
}

export class WidgetErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMessage: null, retryKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message || 'Unknown error' }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface to the browser console so Sentry/PostHog/manual
    // debugging can pick it up. Doesn't leak PII because we only
    // log the message + component-stack, not props.
    console.warn(`[widget:${this.props.widgetName}] crashed:`, error.message, info.componentStack?.split('\n').slice(0, 5).join('\n'))
  }

  handleRetry = (): void => {
    this.setState((prev) => ({
      hasError: false,
      errorMessage: null,
      retryKey: prev.retryKey + 1,
    }))
    this.props.onRetry?.()
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="bg-gray-900/60 border border-rose-900/50 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-rose-400 text-base leading-none mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-rose-200 text-xs font-medium">
              {this.props.widgetName} unavailable
            </p>
            <p className="text-gray-500 text-[11px] mt-0.5 truncate" title={this.state.errorMessage || ''}>
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-2 text-[11px] text-rose-300 hover:text-white border border-rose-900/50 hover:border-rose-700 rounded-md px-2 py-1 transition-colors"
            >
              ⟳ Retry
            </button>
          </div>
        </div>
      )
    }

    // The `key` prop on the wrapper resets the child subtree's state
    // when retryKey changes, giving Retry a clean "try again" semantic.
    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>
  }
}
