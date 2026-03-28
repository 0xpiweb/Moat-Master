import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '$BENSI Hub',
  icons: { icon: [{ url: '/logo-bensi.png', type: 'image/png' }], apple: '/logo-bensi.png' },
}

export default function BensiLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
