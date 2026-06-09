'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [missatge, setMissatge] = useState('')
    const [loading, setLoading] = useState(false)
    const [esRegistre, setEsRegistre] = useState(false)
    const router = useRouter()

    // Si ja està autenticat, redirigir a la pàgina principal
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data.user) router.push('/')
        })
    }, [])

    async function handleEmail() {
        setLoading(true)
        if (esRegistre) {
            const { error } = await supabase.auth.signUp({ email, password })
            if (error) setMissatge(error.message)
            else setMissatge('Comprova el teu email per confirmar!')
        } else {
            const { error } = await supabase.auth.signInWithPassword({ email, password })
            if (error) setMissatge('Email o contrasenya incorrectes')
            else router.push('/')
        }
        setLoading(false)
    }

    async function handleGoogle() {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + '/' }
        })
    }

    return (
        <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
            <div className="bg-gray-900 p-8 rounded-xl w-full max-w-md border border-gray-800">
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
            </div>
        </main>
    )
}