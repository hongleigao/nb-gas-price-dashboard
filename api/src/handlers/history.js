export async function handleHistory(request, env) {
    const db = env.D1_DB;
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '90', 10);

    try {
        const { results: eubHistory } = await db.prepare(
            "SELECT effective_date as date, max_price FROM eub_prices ORDER BY effective_date DESC LIMIT ?"
        ).bind(days).all();

        const { results: marketHistory } = await db.prepare(
            "SELECT date, rbob_cad_base FROM market_data ORDER BY date DESC LIMIT ?"
        ).bind(days).all();

        return new Response(JSON.stringify({
            eub: eubHistory,
            market: marketHistory
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=1800'
            },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
