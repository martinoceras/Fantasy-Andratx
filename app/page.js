import Link from 'next/link'

export default function Home() {
    return (
        <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center">
            <div className="text-center">
                <h1 className="text-5xl font-bold text-green-400 mb-4">⚽ Fantasy Andratx</h1>
                <p className="text-gray-400 text-xl mb-8">La lliga dels amics</p>
                <div className="flex flex-wrap gap-4 justify-center">
                    <Link href="/draft" className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold transition">
                        Sala de Draft
                    </Link>
                    <Link href="/equip" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition">
                        El meu equip
                    </Link>
                    <Link href="/classificacio" className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold transition">
                        Classificació
                    </Link>
                </div>
            </div>
        </main>
    )
}