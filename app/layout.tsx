import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MailForge',
  description: 'Simple bulk email for small senders.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-white text-slate-900">{children}</body>
    </html>
  );
}
