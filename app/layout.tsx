import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'FORME — Secondhand, personally.', description: 'A considered way to discover secondhand fashion. Your styles, your brands, your next find.' };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
