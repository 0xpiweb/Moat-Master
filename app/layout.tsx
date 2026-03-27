import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { getConfig } from '@/lib/config'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

const cfg = getConfig()

export const metadata: Metadata = {
  title: cfg.name,
  description: `Live terminal for ${cfg.ticker}`,
  icons: {
    icon: [
      { url: cfg.logo, type: 'image/png' },
      { url: `${cfg.logo}?v=2`, type: 'image/png' },
    ],
    apple: cfg.logo,
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
