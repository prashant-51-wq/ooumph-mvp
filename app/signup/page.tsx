'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'Sign up failed'); return }

      localStorage.setItem('userEmail', data.email)
      localStorage.setItem('userName', data.name)
      // No workspace yet — redirect to onboarding
      router.push('/dashboard/onboarding')
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">O</div>
            <span className="font-semibold text-white text-xl">Ooumph</span>
          </Link>
          <h1 className="text-2xl font-bold text-white">Create your workspace</h1>
          <p className="text-gray-400 text-sm mt-1">Start your AI marketing agency in minutes</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">{error}</div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1.5">Full Name</label>
              <input
                type="text" required autoComplete="name"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                placeholder="Prashant Mishra"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1.5">Work Email</label>
              <input
                type="email" required autoComplete="email"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1.5">Password</label>
              <input
                type="password" required autoComplete="new-password"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1.5">Confirm Password</label>
              <input
                type="password" required autoComplete="new-password"
                value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors mt-2">
              {loading ? 'Creating account...' : 'Create Free Account →'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-600 mt-4">
            By signing up you agree to our Terms of Service and Privacy Policy.
          </p>
          <p className="text-center text-sm text-gray-500 mt-3">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
