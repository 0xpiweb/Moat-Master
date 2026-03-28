import type { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL('https://dish-hub.vercel.app'),
  title: '$DISH Hub',
  description: 'Live supply analytics for $DISH — staked, locked, burned, LP, and circulating supply powered by The Moat.',
  alternates: {
    canonical: '/',
  },
  icons: {
    icon:  [{ url: '/dish-logo.png', type: 'image/png' }],
    apple: '/dish-logo.png',
  },
  openGraph: {
    title:       '$DISH Hub',
    description: 'Live supply analytics for $DISH — staked, locked, burned, LP, and circulating supply powered by The Moat.',
    url:         'https://dish-hub.vercel.app',
    siteName:    '$DISH Hub',
    images: [{ url: '/dish-logo.png', width: 512, height: 512, alt: '$DISH' }],
    type:        'website',
  },
  twitter: {
    card:        'summary',
    title:       '$DISH Hub',
    description: 'Live supply analytics for $DISH — staked, locked, burned, LP, and circulating supply powered by The Moat.',
    images:      ['/dish-logo.png'],
  },
}

export default function DishLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
