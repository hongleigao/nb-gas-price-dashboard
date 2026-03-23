from playwright.sync_api import sync_playwright
import json

# 定义模拟场景
SCENARIOS = {
    "SC-01 (紧急熔断暴涨)": {
        "prediction": {"change": 6.5, "direction": "up", "risk_level": "red", "window": {"locked_days": 3, "progress": 60}, "attribution": {"commodity": 6.0, "fx": 0.5}},
        "metadata": {"current_nb_price": 182.0, "nb_last_date": "2026-03-22", "nb_delta": 6.2, "last_sync": "2026-03-22T20:00:00Z"}
    },
    "SC-02 (紧急熔断大跌)": {
        "prediction": {"change": -6.2, "direction": "down", "risk_level": "red", "window": {"locked_days": 3, "progress": 60}, "attribution": {"commodity": -6.5, "fx": 0.3}},
        "metadata": {"current_nb_price": 182.0, "nb_last_date": "2026-03-22", "nb_delta": 6.2, "last_sync": "2026-03-22T20:00:00Z"}
    },
    "SC-03 (常规下周五涨价)": {
        "prediction": {"change": 2.5, "direction": "up", "risk_level": "green", "window": {"locked_days": 3, "progress": 60}, "attribution": {"commodity": 2.7, "fx": -0.2}},
        "metadata": {"current_nb_price": 182.0, "nb_last_date": "2026-03-22", "nb_delta": 6.2, "last_sync": "2026-03-22T20:00:00Z"}
    },
    "SC-04 (常规下周五跌价)": {
        "prediction": {"change": -3.0, "direction": "down", "risk_level": "green", "window": {"locked_days": 3, "progress": 60}, "attribution": {"commodity": -3.5, "fx": 0.5}},
        "metadata": {"current_nb_price": 182.0, "nb_last_date": "2026-03-22", "nb_delta": 6.2, "last_sync": "2026-03-22T20:00:00Z"}
    },
    "SC-05 (价格稳定)": {
        "prediction": {"change": 0.1, "direction": "stable", "risk_level": "green", "window": {"locked_days": 3, "progress": 60}, "attribution": {"commodity": 0.1, "fx": 0.0}},
        "metadata": {"current_nb_price": 182.0, "nb_last_date": "2026-03-22", "nb_delta": 6.2, "last_sync": "2026-03-22T20:00:00Z"}
    }
}

def test_all_copywriting():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # 监听控制台错误
        page.on("console", lambda msg: print(f"  [BROWSER] {msg.type}: {msg.text}") if msg.type == "error" else None)
        
        print("\n=== NB Gas Pulse 文案逻辑多场景测试 ===\n")
        
        for name, data in SCENARIOS.items():
            # 使用 init_script 在页面加载前 mock fetch
            mock_script = f"""
            window.fetch = () => Promise.resolve({{
                json: () => Promise.resolve({json.dumps(data)})
            }});
            """
            page.add_init_script(mock_script)
            
            page.goto('http://localhost:8000')
            
            # 等待骨架屏消失
            page.wait_for_selector('#real-content', state='visible', timeout=5000)
            # 等待文本更新（跳过初始状态）
            page.wait_for_function("document.getElementById('decision-text').innerText !== 'Analyzing Intelligence'")
            
            badge = page.inner_text('#decision-text')
            copy = page.inner_text('#pred-direction')
            
            print(f"场景: {name}")
            print(f"├─ 状态标题: {badge}")
            print(f"└─ 建议文案: {copy}\n")
            
        browser.close()

if __name__ == "__main__":
    test_all_copywriting()
