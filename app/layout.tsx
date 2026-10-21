import type { Metadata } from 'next';
import { Suspense } from 'react';
import Forme from '@/components/forme';
import './globals.css';
export const metadata: Metadata = { title: 'FORME — Secondhand, personally.', description: 'A considered way to discover secondhand fashion. Your styles, your brands, your next find.' };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body><Suspense fallback={<div className="loading">FORME · Loading your edit…</div>}><Forme /></Suspense>{children}</body></html>; }
