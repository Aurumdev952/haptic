import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

// GeistSans from 'geist/font/sans' is an object that directly provides .variable.
// The default CSS variable it sets up is --font-geist-sans, which is used in globals.css.

export const metadata: Metadata = {
  title: 'Haptic',
  description: 'AI-powered speech interaction application.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} font-sans antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
