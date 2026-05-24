import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Ooumph — AI Marketing Agency OS',
  description: 'Your AI marketing workforce. Strategy, content, funnels, and leads — all in one command center.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-gray-950 text-white">{children}</body>
    </html>
  )
}
