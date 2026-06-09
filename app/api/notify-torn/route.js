import { Resend } from 'resend'

export async function POST(request) {
    const { email, nom, torn, jugadorsTriats } = await request.json()

    // Si no hi ha clau API, simplement no enviem email (no trenca el build)
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
        console.warn('RESEND_API_KEY no configurada, email no enviat.')
        return Response.json({ ok: true, skipped: true })
    }

    const resend = new Resend(apiKey)

    try {
        await resend.emails.send({
            from: 'Fantasy Andratx <onboarding@resend.dev>',
            to: email,
            subject: '⚽ STOOOPPPEEERRR TE TOCA TRIAAAARRR!!!!!',
            html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #111827; color: white; padding: 32px; border-radius: 12px;">
            <h1 style="color: #4ade80; font-size: 24px;">⚽ Fantasy Andratx</h1>
            <h2 style="color: white;">Venga que te toca triar, ${nom}!</h2>
            <p style="color: #9ca3af;">Torn número <strong style="color: white;">${torn}</strong></p>
            <p style="color: #9ca3af;">Jugadors triats fins ara: <strong style="color: white;">${jugadorsTriats}</strong></p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/draft"
               style="display: inline-block; background: #22c55e; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
              Triar jugador ara →
            </a>
            <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">Fantasy Andratx · La lliga dels amics</p>
          </div>
        `
        })
    } catch (err) {
        console.error('Error enviant email:', err.message)
    }

    return Response.json({ ok: true })
}