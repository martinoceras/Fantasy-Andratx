'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)),
    ])
}

export default function AuthCallback() {
    const router = useRouter()

    useEffect(() => {
        let finished = false

        async function handleCallback() {
            try {
                // Alguns proveidors tornen tokens a l'hash (#access_token=...)
                // i d'altres tornen ?code=... (PKCE). Gestionem ambdós casos.
                const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
                const accessToken = hashParams.get('access_token')
                const refreshToken = hashParams.get('refresh_token')

                if (accessToken && refreshToken) {
                    const { error: setSessionError } = await withTimeout(
                        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }),
                        7000,
                        'setSession'
                    )
                    if (setSessionError) {
                        console.error('[auth/callback] Error setSession:', setSessionError)
                    }
                } else {
                    const query = new URLSearchParams(window.location.search)
                    const code = query.get('code')
                    if (code) {
                        const { error: exchangeError } = await withTimeout(
                            supabase.auth.exchangeCodeForSession(code),
                            7000,
                            'exchangeCodeForSession'
                        )
                        if (exchangeError) {
                            console.error('[auth/callback] Error exchangeCodeForSession:', exchangeError)
                        }
                    }
                }

                const { data: { session } } = await withTimeout(supabase.auth.getSession(), 7000, 'getSession')
                const user = session?.user || null

                if (!user) {
                    console.error('[auth/callback] Sense sessio després del callback. URL:', window.location.href)
                    if (!finished) router.replace('/login')
                    return
                }

                const meta = user.user_metadata || {}
                const nom = meta.full_name || meta.name || user.email?.split('@')[0] || 'Usuari'

                // Crea o actualitza el perfil via API (service key, bypassa RLS)
                const res = await fetch('/api/auth/ensure-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: user.id, email: user.email, nom }),
                }).catch((e) => {
                    console.error('[auth/callback] ensure-profile exception:', e)
                    return null
                })

                if (res && !res.ok) {
                    const d = await res.json().catch(() => ({}))
                    console.error('[auth/callback] ensure-profile error:', d)
                }

                if (!finished) router.replace('/')
            } catch (e) {
                console.error('[auth/callback] exception:', e)
                if (!finished) router.replace('/login')
            }
        }

        // Evita quedar-se bloquejat indefinidament en aquesta pantalla.
        const hardFallback = setTimeout(() => {
            if (!finished) {
                console.error('[auth/callback] Hard fallback -> /login')
                router.replace('/login')
            }
        }, 12000)

        handleCallback()

        return () => {
            finished = true
            clearTimeout(hardFallback)
        }
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

