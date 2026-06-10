'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

export default function AuthCallback() {
    const router = useRouter()

    useEffect(() => {
        async function handleCallback() {
            try {
                // Bescanvia el codi PKCE per una sessió real
                const { data: { session }, error } = await supabase.auth.getSession()

                if (error || !session?.user) {
                    console.error('[auth/callback] No s\'ha pogut obtenir la sessió:', error)
                    router.push('/login')
                    return
                }

                const user = session.user
                const meta = user.user_metadata || {}
                const nom = meta.full_name || meta.name || user.email?.split('@')[0] || 'Usuari'

                // Crea o actualitza el perfil via API (service key, bypassa RLS)
                const res = await fetch('/api/auth/ensure-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: user.id, email: user.email, nom }),
                })

                if (!res.ok) {
                    const d = await res.json().catch(() => ({}))
                    console.error('[auth/callback] ensure-profile error:', d)
                }

                router.push('/')
            } catch (e) {
                console.error('[auth/callback] exception:', e)
                router.push('/')
            }
        }

        handleCallback()
    }, [router])

    return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
            <div className="text-center">
                <div className="text-green-400 text-2xl font-bold animate-pulse mb-3">⚽ Fantasy Andratx</div>
                <p className="text-gray-400 text-sm">Identificant usuari...</p>
            </div>
        </div>
    )
}

