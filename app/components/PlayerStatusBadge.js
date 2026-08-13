'use client'

const STATUS_META = {
    ok: { label: 'En forma', icon: '✓', color: 'bg-green-500 text-white' },
    injured: { label: 'Lesionat', icon: '✚', color: 'bg-red-500 text-white' },
    doubt: { label: 'Dubte', icon: '?', color: 'bg-amber-400 text-white' },
    sanctioned: { label: 'Sancionat', icon: '!', color: 'bg-red-700 text-white' },
    unknown: { label: 'Estat desconegut', icon: '?', color: 'bg-gray-500 text-white' },
    discarded: { label: 'No convocable', icon: '-', color: 'bg-zinc-500 text-white' },
}

function normalizeStatus(status) {
    const key = String(status || 'unknown').toLowerCase().trim()
    return STATUS_META[key] ? key : 'unknown'
}

function getStatusInfo(player) {
    const info = player?.status_info ?? player?.statusInfo ?? ''
    return String(info || '').trim()
}

export default function PlayerStatusBadge({ player, className = '' }) {
    const statusKey = normalizeStatus(player?.status)
    const meta = STATUS_META[statusKey]
    const info = getStatusInfo(player)
    const title = info ? `${meta.label}: ${info}` : meta.label

    return (
        <span
            title={title}
            aria-label={title}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold shadow-md ring-1 ring-black/40 ${meta.color} ${className}`}
        >
            {meta.icon}
        </span>
    )
}

