// 内部工具函数：获取基于 Moncton 时区的周期边界
function getMonctonCycleDates() {
    // 强制转换为 America/Moncton 时区的 YYYY-MM-DD
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Moncton', 
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const todayStr = formatter.format(new Date());
    
    // 修正：将 split 出来的字符串数组强制转换为 Number 类型
    const [y, m, d] = todayStr.split('-').map(Number);
    
    // 使用 UTC 构建 Date 对象，避免服务器本地时区干扰推算
    const todayDate = new Date(Date.UTC(y, m - 1, d)); 
    const dayOfWeek = todayDate.getUTCDay(); // 0(Sun) - 6(Sat)
    
    // 核心逻辑：寻找最近的“上一个星期四 (Thu = 4)”作为本周期的起点
    let daysSinceThu = dayOfWeek - 4;
    if (daysSinceThu < 0) daysSinceThu += 7;

    // 当前周期的起点 (本周四/上周四)
    const currentStart = new Date(todayDate);
    currentStart.setUTCDate(todayDate.getUTCDate() - daysSinceThu);
    
    // 上一个周期的起点 (再往前推 7 天)
    const prevStart = new Date(currentStart);
    prevStart.setUTCDate(currentStart.getUTCDate() - 7);
    
    return {
        currentStartStr: currentStart.toISOString().split('T')[0],
        prevStartStr: prevStart.toISOString().split('T')[0]
    };
}

export async function handleCycle(request, env) {
    const db = env.D1_DB;

    try {
        // 1. 获取当前正在生效的 EUB 官方限价
        const { results: eubData } = await db.prepare(
            "SELECT effective_date, max_price, is_interrupter, interrupter_variance FROM eub_prices ORDER BY effective_date DESC LIMIT 1"
        ).all();

        if (eubData.length === 0) {
            return new Response(JSON.stringify({ 
                status: "error", 
                error: { code: "NO_DATA", message: 'No EUB price data available' } 
            }), { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
        }
        const currentEub = eubData[0];

        // 2. 动态计算日历窗口
        const { currentStartStr, prevStartStr } = getMonctonCycleDates();

        // 3. 从数据库捞取包括“上一周期”和“当前周期”在内的所有市场数据
        const { results: marketData } = await db.prepare(
            "SELECT * FROM market_data WHERE date >= ? ORDER BY date ASC"
        ).bind(prevStartStr).all();

        // 4. 拆分数据并计算 benchmark (上一周期的平均基准价)
        const previousCycle = marketData.filter(r => r.date < currentStartStr && r.is_weekend === 0);
        let benchmarkPrice = 0.0;
        if (previousCycle.length > 0) {
            const sum = previousCycle.reduce((acc, row) => acc + row.rbob_cad_base, 0);
            benchmarkPrice = parseFloat((sum / previousCycle.length).toFixed(4));
        }

        // 5. 组装当前周期的数据数组 (匹配前端契约)
        const marketCycle = marketData
            .filter(r => r.date >= currentStartStr)
            .map(r => ({
                date: r.date,
                absolute_price: parseFloat(r.rbob_cad_base.toFixed(4)),
                is_weekend: r.is_weekend
            }));

        // 6. 获取数据库最后同步时间，供前端触发降级策略
        const { results: syncData } = await db.prepare("SELECT max(date) as last_date FROM market_data").all();

        // 7. 严格按 v1.9 文档 Envelope 结构组装响应
        const responseData = {
            status: "success",
            data: {
                current_eub: {
                    effective_date: currentEub.effective_date,
                    max_price: currentEub.max_price,
                    is_interrupter: currentEub.is_interrupter,
                    interrupter_variance: currentEub.interrupter_variance || 0.0
                },
                benchmark_price: benchmarkPrice,
                market_cycle: marketCycle
            },
            meta: {
                last_sync_time: syncData[0]?.last_date || new Date().toISOString(),
                timezone: "America/Moncton"
            }
        };

        return new Response(JSON.stringify(responseData), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=1800' // CDN 防抖缓存
            },
        });
    } catch (e) {
        return new Response(JSON.stringify({ 
            status: "error", 
            error: { code: "SERVER_ERROR", message: e.message } 
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
        });
    }
}