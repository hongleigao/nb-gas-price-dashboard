import json
import os
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta

# 配置输出目录
os.makedirs('test_results/screenshots', exist_ok=True)

# --- 模拟数据生成器 ---
def mock_api_response(current_eub_price, interrupter_variance, interrupter_total, market_days_data, benchmark):
    """
    生成符合 api/v1/cycle/current 格式的模拟数据
    """
    return {
        "status": "success",
        "data": {
            "current_eub": {
                "effective_date": datetime.now().strftime('%Y-%m-%d'),
                "max_price": current_eub_price,
                "is_interrupter": 1 if interrupter_variance != 0 else 0,
                "interrupter_variance": interrupter_variance
            },
            "benchmark_price": benchmark,
            "interrupter_total": interrupter_total,
            "market_cycle": market_days_data
        },
        "meta": {
            "last_sync_time": datetime.now().strftime('%Y-%m-%d %H:%M'),
            "timezone": "America/Moncton"
        }
    }

# --- 测试场景定义 ---
SCENARIOS = {
    # 场景 1: 周四 19:00 - 数据同步瞬间 (Day 5 缺失)
    "thursday_sync_limbo": mock_api_response(
        current_eub_price=177.5,
        interrupter_variance=-4.5,
        interrupter_total=1.7, # 累计熔断
        benchmark=75.0, # 假设上周基准
        market_days_data=[
            {"date": "2026-03-19", "absolute_price": 78.5, "is_weekend": 0},
            {"date": "2026-03-20", "absolute_price": 79.2, "is_weekend": 0},
            {"date": "2026-03-23", "absolute_price": 77.0, "is_weekend": 0},
            {"date": "2026-03-24", "absolute_price": 76.5, "is_weekend": 0},
            # Day 5 (Wed 25) 缺失，测试 "Market not closed" 占位
        ]
    ),
    
    # 场景 2: 极端波动触发 ALERT (累积偏差 > 5.0c 税前)
    "alert_threshold_triggered": mock_api_response(
        current_eub_price=180.0,
        interrupter_variance=0,
        interrupter_total=0,
        benchmark=70.0,
        market_days_data=[
            {"date": "2026-03-19", "absolute_price": 76.0, "is_weekend": 0}, # +6.0c 偏差
        ]
    ),
    
    # 场景 3: 多次熔断叠加周 (验证 CycleDetails 顶部公式)
    "multi_interrupter_week": mock_api_response(
        current_eub_price=175.0,
        interrupter_variance=-2.5,
        interrupter_total=5.5, # 假设本周已经累计熔断了 5.5c
        benchmark=72.0,
        market_days_data=[
            {"date": "2026-03-19", "absolute_price": 75.0, "is_weekend": 0},
            {"date": "2026-03-20", "absolute_price": 74.5, "is_weekend": 0},
        ]
    ),

    # 场景 4: 数据库空值/错误处理
    "null_data_safety": {
        "status": "success",
        "data": {
            "current_eub": None,
            "benchmark_price": 0,
            "interrupter_total": 0,
            "market_cycle": []
        }
    }
}

def run_visual_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 模拟常见手机尺寸，因为用户多在手机端查看
        context = browser.new_context(viewport={'width': 390, 'height': 844}) 
        
        for name, mock_data in SCENARIOS.items():
            print(f"🎬 正在测试场景: {name}...")
            page = context.new_page()
            
            # 拦截 API 请求并返回模拟数据
            page.route("**/api/v1/cycle/current", lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(mock_data),
                headers={"Access-Control-Allow-Origin": "*"}
            ))
            
            try:
                # 访问本地开发服务器
                page.goto('http://localhost:5173') 
                page.wait_for_load_state('networkidle')
                page.wait_for_timeout(1000) # 等待 React 渲染动画
                
                # 1. 截图 HeroBoard
                page.screenshot(path=f'test_results/screenshots/{name}_01_heroboard.png')
                
                # 2. 点击进入详情页
                explore_btn = page.locator('button:has-text("Explore Our Model")')
                if explore_btn.is_visible():
                    explore_btn.click()
                    page.wait_for_timeout(800)
                    # 截图 CycleDetails
                    page.screenshot(path=f'test_results/screenshots/{name}_02_details.png')
                
                print(f"✅ {name} 测试完成，截图已保存。")
                
            except Exception as e:
                print(f"❌ {name} 测试失败: {e}")
            finally:
                page.close()
                
        browser.close()

if __name__ == "__main__":
    run_visual_tests()