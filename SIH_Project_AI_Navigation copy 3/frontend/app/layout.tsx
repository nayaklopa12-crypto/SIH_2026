import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Antarctic Navigation Intelligence | Caffeine Geeks',
  description: 'AI-enabled sea-ice forecasting, iceberg trajectory prediction, and risk-aware route optimization for Antarctic missions.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const importmap = JSON.stringify({
    imports: {
      three: 'https://unpkg.com/three@0.160.0/build/three.module.js',
      'three/addons/': 'https://unpkg.com/three@0.160.0/examples/jsm/',
    },
  })
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script type="importmap" dangerouslySetInnerHTML={{ __html: importmap }} />
      </head>
      <body className="polar-bg font-sans antialiased">
        {/* Three.js sets width/height/data-engine on this canvas after mount,
            which the server HTML can't know — suppress the expected mismatch. */}
        <canvas id="ice-bg" aria-hidden="true" suppressHydrationWarning />
        {children}
        <script type="module" src="/ice-field.mjs" />
      </body>
    </html>
  )
}
