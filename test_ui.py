from playwright.sync_api import sync_playwright
import time
import os

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        
        # Capture console logs
        page.on("console", lambda msg: print(f"CONSOLE: {msg.type}: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        print("Navigating to http://localhost:8000...")
        page.goto('http://localhost:8000')
        
        # Wait for data to load and ECharts to render
        print("Waiting for networkidle and elements...")
        page.wait_for_load_state('networkidle')
        page.wait_for_selector('#real-content', state='visible', timeout=10000)
        
        # Give ECharts and animations some time
        time.sleep(2) 
        
        # Take a screenshot for visual verification
        screenshot_path = 'test_results_ui.png'
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"Screenshot saved to {screenshot_path}")

        # Verify Key UI Elements
        print("Verifying UI elements...")
        
        # 1. Hero Banner Decision
        decision_text = page.inner_text('#decision-text')
        print(f"Decision Badge Text: {decision_text}")
        
        # 2. Prediction Value
        pred_val = page.inner_text('#pred-val')
        print(f"Prediction Value: {pred_val}")
        
        # 3. Spread Meter
        spread_fill_style = page.get_attribute('#spread-fill', 'style')
        print(f"Spread Meter Style: {spread_fill_style}")
        
        # 4. Chart Visibility
        chart_visible = page.is_visible('#chart')
        print(f"Chart Visible: {chart_visible}")

        # Check for error indicators
        if "Data Sync Error" in page.content():
            print("❌ Found 'Data Sync Error' on page!")
        else:
            print("✅ No sync errors found.")

        browser.close()

if __name__ == "__main__":
    run_test()
