import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">O</div>
          <span className="font-semibold text-white text-lg">Ooumph</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="px-4 py-2 text-gray-300 hover:text-white text-sm font-medium transition-colors">
            Sign in
          </Link>
          <Link href="/signup" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
            Start building free →
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center px-4">

        {/* Hero */}
        <section className="flex flex-col items-center text-center pt-24 pb-20 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950 border border-indigo-800 text-indigo-300 text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            Early access — now open
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-6">
            Your AI Marketing Team,{' '}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">on demand.</span>
          </h1>

          <p className="text-xl text-gray-400 mb-10 leading-relaxed">
            Tell your CMO what you need. It assembles the right AI agents, does the work, and shows you everything before anything ships.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/signup" className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-lg transition-all hover:scale-105">
              Start building free →
            </Link>
            <Link href="/login" className="px-8 py-4 rounded-xl border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold text-lg transition-colors">
              Sign in
            </Link>
          </div>
        </section>

        {/* How it works */}
        <section className="w-full max-w-3xl pb-20">
          <h2 className="text-center text-white font-bold text-2xl mb-10">How it works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: '1',
                title: 'Brief your CMO',
                desc: 'Describe your goal in plain English. No forms, no configuration.',
                color: 'from-indigo-500 to-purple-500',
              },
              {
                step: '2',
                title: 'Team assembles automatically',
                desc: 'The CMO picks the right agents — strategy, content, ads, email — and starts working.',
                color: 'from-purple-500 to-pink-500',
              },
              {
                step: '3',
                title: 'Review and approve',
                desc: 'Every piece of work lands in your approval queue. Nothing ships without your sign-off.',
                color: 'from-pink-500 to-rose-500',
              },
            ].map(item => (
              <div key={item.step} className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white font-bold text-sm mb-4`}>
                  {item.step}
                </div>
                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Feature strip */}
        <section className="w-full max-w-3xl pb-20">
          <h2 className="text-center text-white font-bold text-2xl mb-10">What your team handles</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { icon: '🧠', label: 'Strategy & Planning', desc: 'ICP, positioning, 30-day roadmap' },
              { icon: '✍️', label: 'Content at scale', desc: 'Blog posts, social copy, scripts' },
              { icon: '🎯', label: 'Lead generation', desc: 'Find, enrich, and qualify prospects' },
              { icon: '📢', label: 'Paid advertising', desc: 'Ad copy, targeting, and reporting' },
              { icon: '📧', label: 'Email marketing', desc: 'Sequences, campaigns, and lists' },
              { icon: '📊', label: 'Analytics & insights', desc: 'Performance summaries and trends' },
            ].map(f => (
              <div key={f.label} className="p-5 rounded-xl bg-gray-900 border border-gray-800 text-left">
                <div className="text-2xl mb-3">{f.icon}</div>
                <div className="text-white font-medium text-sm mb-1">{f.label}</div>
                <div className="text-gray-500 text-xs leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="w-full max-w-3xl pb-20">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
            <h2 className="text-white font-bold text-2xl mb-3">Ready to build your team?</h2>
            <p className="text-gray-400 mb-8">Start for free — no credit card required.</p>
            <Link href="/signup" className="inline-block px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-lg transition-all hover:scale-105">
              Start building free →
            </Link>
          </div>
        </section>

      </main>

      <footer className="border-t border-gray-800 px-6 py-5 text-center">
        <p className="text-gray-600 text-sm">Built on Claude. Every output reviewed by you. Nothing publishes automatically.</p>
      </footer>
    </div>
  )
}
