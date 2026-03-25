export async function handleHistory(request, env) {
    const db = env.D1_DB;
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30', 10); // 默认值也改为 30 天

    try {
        // 1. 架构师修复：在 JS 中计算真实的日期边界
        const dateLimit = new Date();
        dateLimit.setUTCDate(dateLimit.getUTCDate() - days);
        const dateStr = dateLimit.toISOString().split('T')[0];

        // 2. 完美的 LOCF 锚点 SQL：确保拿到日期窗口前最后一次生效的官方价格，防止图表左侧断线
        const { results: eubHistory } = await db.prepare(`
            SELECT effective_date as date, max_price, is_interrupter 
            FROM eub_prices 
            WHERE effective_date >= (
                SELECT IFNULL(MAX(effective_date), '1970-01-01') 
                FROM eub_prices 
                WHERE effective_date <= ?
            )
            ORDER BY effective_date DESC
        `).bind(dateStr).all();

        // 3. 市场数据：按真实的日期边界提取
        const { results: marketHistory } = await db.prepare(
            "SELECT date, rbob_cad_base FROM market_data WHERE date >= ? ORDER BY date DESC"
        ).bind(dateStr).all();

        // 4. 统一 Envelope 响应结构
        return new Response(JSON.stringify({
            status: "success",
            data: {
                eub_history: eubHistory,
                market_history: marketHistory
            },
            meta: {
                query_days: days,
                start_date: dateStr
            }
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=1800'
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