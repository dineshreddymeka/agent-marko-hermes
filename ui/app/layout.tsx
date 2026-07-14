import type { Metadata } from 'next'
import { Fraunces, IBM_Plex_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const uiSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
})

const brandSerif = Fraunces({
  subsets: ['latin'],
  variable: '--font-brand',
  display: 'swap',
})

const codeMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-code',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Open Jarvis',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${uiSans.variable} ${brandSerif.variable} ${codeMono.variable}`}
    >
      <body className="h-full min-h-screen bg-canvas font-sans text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
