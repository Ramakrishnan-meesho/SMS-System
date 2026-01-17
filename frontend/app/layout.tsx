import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SMS Messaging System',
  description: 'SMS messaging interface',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
