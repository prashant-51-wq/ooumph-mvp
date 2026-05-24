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
        <Link href="/onboarding" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
          Start Free Demo
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950 border border-indigo-800 text-indigo-300 text-sm mb-8">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
          AI Marketing Agency OS — Now in Demo
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-white leading-tight mb-6 max-w-4xl">
          Your AI Marketing{' '}
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Workforce</span>
        </h1>

        <p className="text-xl text-gray-400 mb-10 max-w-2xl leading-relaxed">
          Strategy. Content. Funnels. Leads. In 10 minutes, your AI agency is briefed and building your marketing plan — with you in control of every output.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-16">
          <Link href="/onboarding" className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-lg transition-all hover:scale-105">
            Build My Marketing Plan →
          </Link>
          <Link href="/dashboard" className="px-8 py-4 rounded-xl border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold text-lg transition-colors">
            View Demo Dashboard
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl w-full">
          {[
            { icon: '🧠', label: 'AI Strategy Agent', desc: 'ICP, positioning, KPIs' },
            { icon: '📅', label: 'Content Calendar', desc: '30-day plan in seconds' },
            { icon: '✍️', label: '5 Ready Assets', desc: 'Carousel, reel, email, ads, LinkedIn' },
            { icon: '✅', label: 'Approval Queue', desc: 'You control what goes out' },
            { icon: '🔁', label: 'Learning Engine', desc: 'Feedback improves outputs' },
            { icon: '📄', label: 'Export Plan', desc: 'PDF & DOCX for clients' },
          ].map((f) => (
            <div key={f.label} className="p-4 rounded-xl bg-gray-900 border border-gray-800 text-left">
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="text-white font-medium text-sm">{f.label}</div>
              <div className="text-gray-500 text-xs mt-1">{f.desc}</div>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-gray-800 px-6 py-4 text-center text-gray-600 text-sm">
        Ooumph AI Marketing OS — Demo MVP · Built for Praveen Mishra
      </footer>
    </div>
  )
}
