'use client'
import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'

export default function CalendariPage() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [jornades, setJornades] = useState([])
    const [matches, setMatches] = useState([])
    const [selectedWeek, setSelectedWeek] = useState(null)
    const [updatedAt, setUpdatedAt] = useState(null)

    async function carregarCalendari(week) {
        setLoading(true)
        setError('')
        try {
            const params = new URLSearchParams()
            if (week) params.set('week', String(week))
            const res = await fetch(`/api/biwenger-calendar${params.toString() ? `?${params.toString()}` : ''}`, { cache: 'no-store' })
            const json = await res.json().catch(() => ({}))
            if (!res.ok || !json?.ok) {
                setError(json?.error || 'No s\'ha pogut carregar el calendari')
                return
            }
            setJornades(json.jornades || [])
            setMatches(json.matches || [])
            setSelectedWeek(json.selectedWeek || week || null)
            setUpdatedAt(json.updatedAt || null)
        } catch (err) {
            setError(err?.message || 'Error desconegut carregant el calendari')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const id = setTimeout(() => {
            void carregarCalendari()
        }, 0)
        return () => clearTimeout(id)
    }, [])

    return (
        <>
            <Navbar />
            <main className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-5">
                        <h1 className="text-2xl font-bold text-purple-400">📅 Calendari Biwenger</h1>
                        <p className="text-gray-400 text-sm">Horaris, jornades i partits actualitzats des de Biwenger.</p>
                        {updatedAt && <p className="text-gray-500 text-xs mt-1">Actualitzat: {new Date(updatedAt).toLocaleString('ca-ES')}</p>}
                    </div>

                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 md:p-5 mb-5">
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                            <p className="text-white font-semibold">Tria la jornada</p>
                            <select
                                value={selectedWeek || ''}
                                onChange={(e) => carregarCalendari(Number(e.target.value))}
                                disabled={loading}
                                className="bg-gray-800 border border-gray-700 rounded-lg text-sm font-semibold px-4 py-2 text-white disabled:opacity-50"
                            >
                                {(jornades || []).map(j => (
                                    <option key={j.id} value={j.week}>
                                        {j.name} · {j.gamesCount} partits
                                    </option>
                                ))}
                            </select>
                        </div>

                        {loading && <p className="text-gray-400 text-sm animate-pulse">Carregant partits...</p>}
                        {!loading && error && <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 text-red-200 text-sm">{error}</div>}

                        {!loading && !error && (
                            <>
                                {matches.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                        {matches.map(match => {
                                            const statusColor = match.isLive
                                                ? 'border-red-500 bg-red-900/20'
                                                : new Date(match.date) < new Date()
                                                    ? 'border-green-500 bg-green-900/20'
                                                    : 'border-gray-600 bg-gray-800/40'
                                            const statusLabel = match.isLive
                                                ? `EN DIRECTE ${match.minute ? `(${match.minute}')` : ''}`
                                                : new Date(match.date) < new Date()
                                                    ? 'FINALITZAT'
                                                    : 'PRÒXIM'
                                            const statusBg = match.isLive
                                                ? 'bg-red-500'
                                                : new Date(match.date) < new Date()
                                                    ? 'bg-green-500'
                                                    : 'bg-gray-600'

                                            return (
                                                <div key={match.id} className={`border-2 rounded-xl p-3 transition-all hover:shadow-lg ${statusColor}`}>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className={`${statusBg} text-white text-[10px] font-bold px-2.5 py-1 rounded-full`}>
                                                            {statusLabel}
                                                        </span>
                                                        {match.minute && <span className="text-red-400 font-bold text-sm">{match.minute}&apos;</span>}
                                                    </div>

                                                    <p className="text-gray-200 text-sm font-semibold mb-2">{match.dateLabel}</p>
                                                    <p className="text-purple-300 text-[11px] font-semibold uppercase tracking-wide mb-2">{match.roundName}</p>

                                                    <div className="bg-black/40 rounded-lg p-3 text-center">
                                                        {match.isLive && match.homeScore !== null && match.awayScore !== null ? (
                                                            <p className="text-2xl font-bold text-yellow-300">{match.homeScore} - {match.awayScore}</p>
                                                        ) : match.resultat ? (
                                                            <p className="text-2xl font-bold text-green-300">{match.resultat}</p>
                                                        ) : (
                                                            <p className="text-gray-400 text-sm">Per jugar</p>
                                                        )}
                                                    </div>

                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-purple-300 text-[13px] font-semibold leading-tight">{match.homeTeam}</p>
                                                        <p className="text-blue-300 text-[13px] font-semibold leading-tight">{match.awayTeam}</p>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-gray-400 text-sm">No hi ha partits disponibles per aquesta jornada.</p>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </main>
        </>
    )
}


