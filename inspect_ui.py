from playwright.sync_api import sync_playwright
import time

def inspect_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        print("正在连接 http://localhost:8000...")
        page.goto('http://localhost:8000')
        
        # 等待内容加载
        try:
            page.wait_for_selector('#real-content', state='visible', timeout=15000)
            print("✅ 页面已加载。")
        except:
            print("❌ 页面加载超时。")
            browser.close()
            return

        # 检查 .insight-hub 容器
        insight_hub = page.locator('.insight-hub')
        if insight_hub.count() > 0:
            print(f"✅ 找到 Insight Hub 容器。可见性: {insight_hub.is_visible()}")
        else:
            print("❌ 未找到 Insight Hub 容器。")

        # 检查驱动力分析
        attr_viz = page.locator('.attribution-viz')
        print(f"驱动力分析面板可见性: {attr_viz.is_visible()}")

        # 检查明细表格
        breakdown_body = page.locator('#breakdown-body')
        print(f"明细表格行数: {breakdown_body.locator('tr').count()}")

        # 截图保存
        page.screenshot(path='ui_inspection.png', full_page=True)
        print("✅ 截图已保存至 ui_inspection.png")
        
        browser.close()

if __name__ == "__main__":
    inspect_ui()
