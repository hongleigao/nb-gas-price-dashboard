from playwright.sync_api import sync_playwright
import json

def run_test_scenario(scenario_name, mock_data):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 将模拟数据写入临时文件，模拟 Worker 返回
        with open('data.json', 'w') as f:
            json.dump(mock_data, f)
            
        page = browser.new_page()
        # 注意：为了测试，我暂时让页面读取本地 data.json
        page.goto('http://localhost:8000') 
        page.wait_for_selector('#real-content')
        
        copy = page.inner_text('#pred-direction')
        print(f"场景 [{scenario_name}]: {copy}")
        browser.close()

# 场景 1: 周日运行，预测下周涨价 (刚熔断后)
mock_sunday_up = {
    "metadata": {
        "nb_last_date": "2026-03-22",
        "current_nb_price": 182.0,
        "nb_delta": 6.2,
        "last_sync": "2026-03-22T20:00:00Z",
        "prediction": {
            "change": 2.5,
            "direction": "up",
            "risk_level": "green",
            "window": {"locked_days": 3, "progress": 60},
            "attribution": {"commodity": 2.7, "fx": -0.2}
        }
    }
}

# 场景 2: 预测下跌
mock_drop = {
    "metadata": {
        "nb_last_date": "2026-03-22",
        "current_nb_price": 182.0,
        "nb_delta": 0,
        "last_sync": "2026-03-22T20:00:00Z",
        "prediction": {
            "change": -3.0,
            "direction": "down",
            "risk_level": "green",
            "window": {"locked_days": 4, "progress": 80},
            "attribution": {"commodity": -3.5, "fx": 0.5}
        }
    }
}

if __name__ == "__main__":
    print("开始文案感官测试...")
    run_test_scenario("上涨建议", mock_sunday_up)
    run_test_scenario("下跌建议", mock_drop)
