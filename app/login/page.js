'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../../lib/supabase'

// Helper per cridar l'API route segura (service key, bypassa RLS)
async function registrarPerfil(user) {
    if (!user?.id) return
    const meta = user.user_metadata || {}
    const nom = meta.full_name || meta.name || user.email?.split('@')[0] || 'Usuari'
    await fetch('/api/auth/ensure-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, email: user.email, nom }),
    })
}

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [missatge, setMissatge] = useState('')
    const [loading, setLoading] = useState(false)
    const [esRegistre, setEsRegistre] = useState(false)
    const [deferredPrompt, setDeferredPrompt] = useState(null)
    const [showInstallHelp, setShowInstallHelp] = useState(false)
    const [guidePlatform, setGuidePlatform] = useState('android')
    const [isIos, setIsIos] = useState(false)
    const [isStandalone, setIsStandalone] = useState(false)
    const [mounted, setMounted] = useState(false)
    const router = useRouter()

    // Si ja està autenticat, redirigir a la pàgina principal
    useEffect(() => {
        const rafMounted = requestAnimationFrame(() => setMounted(true))
        supabase.auth.getUser().then(({ data }) => {
            if (data.user) router.push('/')
        })

        const ua = navigator.userAgent || ''
        const ios = /iPad|iPhone|iPod/.test(ua)
        const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
        const rafPlatform = requestAnimationFrame(() => {
            setIsIos(ios)
            setIsStandalone(standalone)
        })

        const onBeforeInstallPrompt = (event) => {
            event.preventDefault()
            setDeferredPrompt(event)
        }

        window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
        return () => {
            cancelAnimationFrame(rafMounted)
            cancelAnimationFrame(rafPlatform)
            window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
        }
    }, [router])

    async function installAndroid() {
        if (isStandalone) return
        if (!deferredPrompt) {
            setGuidePlatform('android')
            setShowInstallHelp(true)
            return
        }
        deferredPrompt.prompt()
        await deferredPrompt.userChoice
        setDeferredPrompt(null)
    }

    function installIos() {
        if (isStandalone) return
        setGuidePlatform('ios')
        setShowInstallHelp(true)
    }

    async function handleEmail() {
        setLoading(true)

        // Accés directe a admin
        if (email === 'admin' && password === 'fantasy-andratx') {
            sessionStorage.setItem('admin_auth', 'ok')
            router.push('/admin')
            setLoading(false)
            return
        }

        if (esRegistre) {
            const { data, error } = await supabase.auth.signUp({ email, password })
            if (error) setMissatge(error.message)
            else {
                if (data.user && data.session) {
                    await registrarPerfil(data.user)
                    router.push('/')
                    setLoading(false)
                    return
                }
                setMissatge('Comprova el teu email per confirmar!')
            }
        } else {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password })
            if (error) setMissatge('Email o contrasenya incorrectes')
            else {
                await registrarPerfil(data.user)
                router.push('/')
            }
        }
        setLoading(false)
    }

    async function handleGoogle() {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + '/auth/callback' }
        })
    }

    return (
        <main className="min-h-screen text-white flex items-center justify-start relative overflow-hidden">
            {/* Fons gif a tota pantalla */}
            <Image
                src="/musculman.gif"
                alt=""
                fill
                priority
                unoptimized
                className="absolute inset-0 w-full h-full object-cover"
                aria-hidden="true"
            />
            {/* Capa fosca per llegibilitat */}
            <div className="absolute inset-0 bg-black/60" />
            <div className="relative z-10 bg-gray-900/80 backdrop-blur-sm p-8 rounded-xl w-full max-w-md border border-gray-700 ml-4 md:ml-20 mr-4">
                <h1 className="text-3xl font-bold text-green-400 mb-2 text-center">⚽ Fantasy Andratx</h1>
                <p className="text-gray-400 text-center mb-8">La lliga dels amics</p>

                <button
                    onClick={handleGoogle}
                    className="w-full bg-white text-gray-900 font-semibold py-3 rounded-lg mb-6 hover:bg-gray-100 transition flex items-center justify-center gap-2"
                >
                    <span>🔑</span> Entrar amb Google
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="flex-1 h-px bg-gray-700"/>
                    <span className="text-gray-500 text-sm">o amb email</span>
                    <div className="flex-1 h-px bg-gray-700"/>
                </div>

                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                />
                <input
                    type="password"
                    placeholder="Contrasenya"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-4 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                />

                {missatge && <p className="text-yellow-400 text-sm mb-4 text-center">{missatge}</p>}

                <button
                    onClick={handleEmail}
                    disabled={loading}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-lg transition mb-3"
                >
                    {loading ? 'Carregant...' : esRegistre ? 'Crear compte' : 'Entrar'}
                </button>

                <button
                    onClick={() => setEsRegistre(!esRegistre)}
                    className="w-full text-gray-400 hover:text-white text-sm transition"
                >
                    {esRegistre ? 'Ja tinc compte → Entrar' : 'Nou usuari → Crear compte'}
                </button>

                {mounted && !isStandalone && (
                    <div className="grid grid-cols-2 gap-2 mt-4">
                        <button
                            onClick={installAndroid}
                            className="w-full max-w-[165px] justify-self-start rounded-lg overflow-hidden border border-gray-600 hover:border-white transition"
                            aria-label="Instal lar a Android"
                        >
                            <Image src="/badges/google-play.png" alt="Get it on Google Play" width={165} height={50} unoptimized className="w-full h-auto block" />
                        </button>

                        <button
                            onClick={installIos}
                            className="w-full max-w-[165px] justify-self-end rounded-lg overflow-hidden border border-gray-600 hover:border-white transition"
                            aria-label="Instal lar a iPhone"
                        >
                            <Image src="/badges/app-store.png" alt="Download on the App Store" width={165} height={50} unoptimized className="w-full h-auto block" />
                        </button>
                    </div>
                )}
            </div>

            {showInstallHelp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-md w-full shadow-2xl">
                        <h3 className="text-white font-bold text-lg mb-3">Instal·lar l&apos;app</h3>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            <button
                                onClick={() => setGuidePlatform('android')}
                                className={`rounded-lg py-2 text-sm font-semibold transition ${guidePlatform === 'android' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                            >
                                Android
                            </button>
                            <button
                                onClick={() => setGuidePlatform('ios')}
                                className={`rounded-lg py-2 text-sm font-semibold transition ${guidePlatform === 'ios' ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                            >
                                iPhone
                            </button>
                        </div>

                        {guidePlatform === 'android' ? (
                            <ol className="text-gray-300 text-sm space-y-1.5 list-decimal pl-5 mb-4">
                                <li>Obre la web amb Chrome.</li>
                                <li>Prem menú ⋮ i tria &quot;Instal·lar app&quot;.</li>
                                <li>Confirma la instal·lació.</li>
                            </ol>
                        ) : (
                            <>
                                <p className="text-gray-300 text-sm mb-3">{isIos ? 'Passos ràpids des de Safari:' : 'Per iPhone, obre aquesta web amb Safari i segueix aquests passos:'}</p>
                                <ol className="text-gray-300 text-sm space-y-1.5 list-decimal pl-5 mb-4">
                                    <li>Prem el botó compartir.</li>
                                    <li>Selecciona &quot;Afegir a pantalla d inici&quot;.</li>
                                    <li>Confirma amb &quot;Afegir&quot;.</li>
                                </ol>
                            </>
                        )}

                        <button
                            onClick={() => setShowInstallHelp(false)}
                            className="w-full bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl font-medium transition"
                        >
                            Tancar
                        </button>
                    </div>
                </div>
            )}
        </main>
    )
}