'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function Navbar() {
    const pathname = usePathname()
    const router = useRouter()

    async function handleLogout() {
        await supabase.auth.signOut()
        router.push('/login')
    }

    const links = [
        { href: '/classificacio', label: '🏆 Classificació' },
        { href: '/draft',         label: '⚽ Draft' },
        { href: '/equip',         label: '👤 El meu equip' },
        { href: '/canvis',        label: '🔄 Canvis' },
    ]

    return (
        <nav className="bg-gray-900 border-b border-gray-800 px-4 py-2 sticky top-0 z-50">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
                <Link href="/" className="text-green-400 font-bold text-lg">⚽ Fantasy Andratx</Link>
                <div className="flex gap-1">
                    {links.map(l => (
                        <Link key={l.href} href={l.href}
                              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                                  pathname === l.href
                                      ? 'bg-green-500 text-white font-semibold'
                                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                              }`}>
                            {l.label}
                        </Link>
                    ))}
                </div>
                <button onClick={handleLogout} className="text-gray-500 hover:text-white text-sm transition">
                    Tancar sessió
                </button>
            </div>
        </nav>
    )
}