'use client'
import { useMemo, useState } from 'react'

function unique(values) {
    return [...new Set(values.filter(Boolean))]
}

function normalitzaFoto(foto) {
    if (!foto || typeof foto !== 'string') return null
    const neta = foto.trim()
    if (!neta) return null

    // URL antiga que ara retorna HTML: la convertim al CDN actual.
    const legacy = neta.match(/icon_(\d+)\.(png|webp)/i)
    if (legacy?.[1]) return `https://cdn.biwenger.com/i/p/${legacy[1]}.png`
    return neta
}

function idJugador(player) {
    return player?.id ?? player?.player_id ?? player?.biwenger_id ?? null
}

export function buildPlayerPhotoCandidates(player) {
    const id = idJugador(player)
    const fotoNormalitzada = normalitzaFoto(player?.foto)

    return unique([
        fotoNormalitzada,
        id ? `https://cdn.biwenger.com/i/p/hero/${id}.png` : null,
        id ? `https://cdn.biwenger.com/i/p/${id}.png` : null,
    ])
}

export default function BiwengerAvatar({
    player,
    alt,
    className = '',
    fallbackClassName = '',
    initialClassName = '',
}) {
    const candidates = useMemo(() => buildPlayerPhotoCandidates(player), [player])
    const [index, setIndex] = useState(0)

    const src = candidates[index]
    const inicial = player?.nombre?.charAt(0)?.toUpperCase() || '?'

    if (src) {
        return (
            <img
                src={src}
                alt={alt || player?.nombre || 'Jugador'}
                className={className}
                onError={() => setIndex(prev => prev + 1)}
            />
        )
    }

    return (
        <div className={fallbackClassName}>
            <span className={initialClassName}>{inicial}</span>
        </div>
    )
}



