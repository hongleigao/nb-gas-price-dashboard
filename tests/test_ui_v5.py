
import os
import json
from playwright.sync_api import sync_playwright

def test_ui():
    with sync_playwright() as p:
        # 启动浏览器
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # 模拟 API 响应数据
        mock_data = {
            "metadata": {
                "last_sync": "2026-03-23T10:00:00Z",
                "nb_last_date": "2026-03-20",
                "current_nb_price": 165.5,
                "nb_delta": 2.5,
                "prediction": {
                    "change": 3.5,
                    "direction": "up",
                    "risk_level": "green",
                    "is_blackout": False,
                    "interrupter_type": "none",
                    "interrupter_reason": "Market stable",
                    "attribution": { 
                        "commodity": 2.45, 
                        "fx": 1.05 
                    },
                    "cumulative_drift": 1.5,
                    "daily_spike": 0.5,
                    "window": { 
                        "locked_days": 3,
                        "progress": 60,
                        "breakdown": [
                            {"date": "Mar 23", "day": "Mon", "diff": 1.2, "is_interrupter": False},
                            {"date": "Mar 20", "day": "Fri", "diff": 0.8, "is_interrupter": False}
                        ] 
                    }
                }
            },
            "dates": ["2026-03-20", "2026-03-23"],
            "nymex_prices": [100.0, 102.5],
            "nb_prices": [163.0, 165.5]
        }

        # 拦截 API 请求并返回 Mock 数据
        page.route("**/nb-gas-pulse-api**", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(mock_data)
        ))

        # 加载本地 index.html
        # 注意：现在 index.html 位于 src/frontend/ 目录下
        file_path = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "../src/frontend/index.html"))
        page.goto(file_path)

        # 等待内容加载
        page.wait_for_selector("#real-content", state="visible")
        # 核心修复：等待数值增长动画完成 (1.2s 动画 + 缓冲)
        page.wait_for_timeout(2000)

        # 1. 验证基础数据显示
        pred_val = page.inner_text("#pred-val")
        print(f"预测涨跌值: {pred_val}")
        assert "+3.5 ¢" in pred_val

        pump_val = page.inner_text("#pump-val")
        print(f"预计油站价格: {pump_val}")
        assert "160.0" in pump_val  # 165.5 - 5.5

        # 2. 验证归因分析 (针对用户反馈的问题)
        # 先点击展开 Pro Mode
        page.click(".pro-toggle")
        page.wait_for_selector("#pro-mode-content", state="visible")

        attr_comm = page.inner_text("#attr-comm")
        attr_fx = page.inner_text("#attr-fx")
        driver_summary = page.inner_text("#driver-summary")

        print(f"市场驱动: {attr_comm}")
        print(f"汇率驱动: {attr_fx}")
        print(f"总结文案: {driver_summary}")

        assert "2.45" in attr_comm
        assert "1.05" in attr_fx
        assert "Global market trend" in driver_summary

        # 3. 验证风险级别颜色
        decision_color = page.evaluate("document.getElementById('decision-text').style.color")
        print(f"决策文本颜色: {decision_color}")

        # 截图保存以供人工确认
        page.screenshot(path="ui_test_result.png")
        print("截图已保存至 ui_test_result.png")

        browser.close()

if __name__ == "__main__":
    test_ui()
