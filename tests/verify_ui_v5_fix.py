
import os
import json
from playwright.sync_api import sync_playwright

def test_ui_zero_attribution():
    """
    测试用例：模拟驱动力全为 0 的情况，验证 UI 是否显示正确的同步提示，
    而不是误报 'Stronger CAD is providing price relief.'。
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        mock_data = {
            "metadata": {
                "last_sync": "2026-03-23T10:00:00Z",
                "nb_last_date": "2026-03-20",
                "current_nb_price": 165.5,
                "nb_delta": 0.0,
                "prediction": {
                    "change": 0.0,
                    "direction": "stable",
                    "risk_level": "green",
                    "is_blackout": False,
                    "attribution": { "commodity": 0.0, "fx": 0.0 },
                    "cumulative_drift": 0.0,
                    "window": { "locked_days": 1, "progress": 20, "breakdown": [] }
                }
            },
            "dates": ["2026-03-23"],
            "nymex_prices": [100.0],
            "nb_prices": [165.5]
        }

        page.route("**/nb-gas-pulse-api**", lambda route: route.fulfill(
            status=200, content_type="application/json", body=json.dumps(mock_data)
        ))

        file_path = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "../src/frontend/index.html"))
        page.goto(file_path)
        page.wait_for_selector("#real-content", state="visible")

        # 验证预测值为 0.0
        pred_val = page.inner_text("#pred-val")
        print(f"预测值: {pred_val}")
        assert "0.0" in pred_val
        assert "+" not in pred_val # 不应有正号

        # 验证驱动力分析
        page.click(".pro-toggle")
        driver_summary = page.inner_text("#driver-summary")
        print(f"驱动总结: {driver_summary}")
        
        # 应该显示同步提示
        assert "synchronized with the current baseline" in driver_summary

        browser.close()

if __name__ == "__main__":
    test_ui_zero_attribution()
