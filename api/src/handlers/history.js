export async function handleHistory(request, env) {
    const db = env.D1_DB;
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '90', 10);

    try {
        // 严格遵循 v1.9 文档 5.3 节的字段要求
        const { results: eubHistory } = await db.prepare(
            "SELECT effective_date, max_price, is_interrupter FROM eub_prices ORDER BY effective_date DESC LIMIT ?"
        ).bind(days).all();

        const { results: marketHistory } = await db.prepare(
            "SELECT date, rbob_cad_base FROM market_data ORDER BY date DESC LIMIT ?"
        ).bind(days).all();

        // 统一 Envelope 响应结构与键名映射
        return new Response(JSON.stringify({
            status: "success",
            data: {
                eub_history: eubHistory,
                market_history: marketHistory
            },
            meta: {
                query_days: days
            }
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=1800' // 缓存半小时，降低 D1 消耗
            },
        });
    } catch (e) {
        return new Response(JSON.stringify({ 
            status: "error", 
            error: { code: "DATABASE_ERROR", message: e.message } 
        }), { 
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}