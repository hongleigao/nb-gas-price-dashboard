export async function handleCycle(request, env) {
    const db = env.D1_DB;

    try {
        // 1. Get current EUB price
        const { results: eubData } = await db.prepare(
            "SELECT * FROM eub_prices ORDER BY effective_date DESC LIMIT 1"
        ).all();

        if (eubData.length === 0) {
            return new Response(JSON.stringify({ error: 'No price data available' }), { status: 404 });
        }
        const currentEub = eubData[0];

        // 2. Market Data
        const { results: marketData } = await db.prepare(
            "SELECT * FROM market_data ORDER BY date DESC LIMIT 10"
        ).all();

        // Simple calculation for MVP as per design Section 3
        // Note: Real logic would need to precisely define previous 5-day regular cycle vs current 5-day window.
        // For this task, I'll calculate based on available history.
        
        const latestMarket = marketData[0] || {};
        const benchmarkPrice = 100.0; // Placeholder for now - needs proper average calculation.
        
        const predictedChange = (latestMarket.rbob_cad_base || 0) - benchmarkPrice;
        
        const responseData = {
            current_price: currentEub.max_price,
            effective_date: currentEub.effective_date,
            is_interrupter: !!currentEub.is_interrupter,
            market: {
                latest_date: latestMarket.date,
                rbob_cad: latestMarket.rbob_cad_base,
            },
            forecast: {
                predicted_change: parseFloat(predictedChange.toFixed(2)),
                pump_estimated: parseFloat((currentEub.max_price - 5.5).toFixed(1)),
                risk_level: predictedChange >= 5.0 ? 'Alert' : (predictedChange >= 4.0 ? 'High' : 'Medium')
            },
            history_5d: marketData.slice(0, 5)
        };

        return new Response(JSON.stringify(responseData), {
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
