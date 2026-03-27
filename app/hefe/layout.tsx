import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '$HEFE Hub',
  description: 'Live terminal for HEFE',
  icons: {
    icon: [
      { url: '/logo-hefe.png', type: 'image/png' },
      { url: '/logo-hefe.png?v=2', type: 'image/png' },
    ],
    apple: '/logo-hefe.png',
  },
}

export default function HefeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
