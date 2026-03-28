import type { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL('https://bensi-hub.vercel.app'),
  title: '$BENSI Hub',
  description: 'Live supply analytics for $BENSI — staked, locked, burned, LP, and circulating supply powered by The Moat.',
  alternates: {
    canonical: '/',
  },
  icons: {
    icon:  [{ url: '/logo-bensi.png', type: 'image/png' }],
    apple: '/logo-bensi.png',
  },
  openGraph: {
    title:       '$BENSI Hub',
    description: 'Live supply analytics for $BENSI — staked, locked, burned, LP, and circulating supply powered by The Moat.',
    url:         'https://bensi-hub.vercel.app',
    siteName:    '$BENSI Hub',
    images: [{ url: '/logo-bensi.png', width: 512, height: 512, alt: '$BENSI' }],
    type:        'website',
  },
  twitter: {
    card:        'summary',
    title:       '$BENSI Hub',
    description: 'Live supply analytics for $BENSI — staked, locked, burned, LP, and circulating supply powered by The Moat.',
    images:      ['/logo-bensi.png'],
  },
}

export default function BensiLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
