import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Booking Platform — Administracija',description:'Osnovna aplikacija za rezervacijo terminov'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="sl"><body>{children}</body></html>}
