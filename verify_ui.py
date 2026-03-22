from playwright.sync_api import sync_playwright
import time

def test_dashboard():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        print("正在连接本地测试服务器 (http://localhost:8000)...")
        page.goto('http://localhost:8000')
        
        # 等待 API 加载完成（骨架屏消失）
        print("等待 API 数据加载...")
        try:
            page.wait_for_selector('#real-content', state='visible', timeout=15000)
            print("✅ 页面已成功从 Worker API 获取数据并渲染。")
        except Exception as e:
            print("❌ API 加载超时或失败。请检查 Worker API 状态。")
            page.screenshot(path='test_error.png')
            browser.close()
            return

        # 1. 验证核心预测值
        pred_val = page.inner_text('#pred-val')
        print(f"核心预测值: {pred_val}")
        
        # 2. 验证熔断风险
        risk_label = page.inner_text('#risk-label')
        print(f"熔断风险状态: {risk_label}")
        
        # 3. 验证计价沙漏
        window_progress = page.inner_text('#window-locked-text')
        print(f"计价沙漏进度: {window_progress}")

        # 4. 验证归因拆解
        attr_comm = page.inner_text('#attr-comm')
        attr_fx = page.inner_text('#attr-fx')
        print(f"归因拆解 - 原油影响: {attr_comm}, 汇率影响: {attr_fx}")

        # 5. 测试 Pro Mode 展开
        print("测试 Pro Mode 切换...")
        page.click('button.pro-toggle')
        time.sleep(1) # 等待动画
        is_visible = page.is_visible('#pro-mode-content')
        print(f"Pro Mode 内容是否可见: {is_visible}")
        
        if is_visible:
            print("✅ 历史趋势图表已成功展开。")
        else:
            print("❌ Pro Mode 切换失败。")

        page.screenshot(path='dashboard_preview.png')
        print("✅ 测试完成，截图已保存至 dashboard_preview.png")
        browser.close()

if __name__ == "__main__":
    test_dashboard()
