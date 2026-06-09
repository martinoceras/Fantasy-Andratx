'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import Navbar from './components/Navbar'

export default function Home() {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) {
                router.push('/login')
            } else {
                setUser(data.user)
                setLoading(false)
            }
        })
    }, [])

    if (loading) return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
            <div className="text-green-400 text-2xl font-bold animate-pulse">⚽ Fantasy Andratx</div>
        </div>
    )

    const seccions = [
        { href: '/classificacio', icon: '🏆', label: 'Classificació',   desc: 'Consulta les classificacions per jornada i general',   color: 'from-yellow-600 to-yellow-800', border: 'border-yellow-600' },
        { href: '/draft',         icon: '⚽', label: 'Draft',           desc: 'Sala de draft — tria els teus jugadors',               color: 'from-green-600 to-green-800',  border: 'border-green-600' },
        { href: '/equip',         icon: '👤', label: 'El meu equip',    desc: 'Gestiona la teva plantilla i formació',                color: 'from-blue-600 to-blue-800',    border: 'border-blue-600' },
        { href: '/canvis',        icon: '🔄', label: 'Canvis',          desc: 'Ronda de canvis de jugadors',                          color: 'from-purple-600 to-purple-800', border: 'border-purple-600' },
        { href: '/canvi-bomba',   icon: '💣', label: 'Canvi BOMBA',     desc: 'Canvi especial — una vegada per volta',                color: 'from-red-600 to-red-800',      border: 'border-red-600' },
    ]

    return (
        <>
            <Navbar />
            <main className="min-h-screen bg-gray-950 text-white p-6">
                <div className="max-w-4xl mx-auto">
                    {/* Capçalera */}
                    <div className="text-center mb-10 pt-6">
                        <h1 className="text-5xl font-bold text-green-400 mb-3">⚽ Fantasy Andratx</h1>
                        <p className="text-gray-400 text-lg">La lliga dels amics</p>
                    </div>

                    {/* Grid de seccions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {seccions.map(s => (
                            <Link key={s.href} href={s.href}
                                  className={`bg-gradient-to-br ${s.color} border ${s.border} rounded-2xl p-6 hover:scale-[1.03] transition-all duration-150 shadow-lg`}>
                                <div className="text-4xl mb-3">{s.icon}</div>
                                <h2 className="text-white font-bold text-xl mb-1">{s.label}</h2>
                                <p className="text-white/70 text-sm">{s.desc}</p>
                            </Link>
                        ))}
                    </div>
                </div>
            </main>
        </>
    )
}