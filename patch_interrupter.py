import os
import requests

CF_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
CF_DATABASE_ID = os.environ.get('CLOUDFLARE_DATABASE_ID')
CF_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')

def mark_interrupter():
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DATABASE_ID}/query"
    headers = {"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"}
    
    # 纠正 3月22日为熔断日
    sql = "UPDATE eub_regulations SET is_interrupter = 1 WHERE effective_date = '2026-03-22';"
    
    print("正在云端数据库中标记 3月22日为熔断调价日...")
    response = requests.post(url, headers=headers, json={"sql": sql})
    
    if response.ok:
        print("✅ 标记成功！请刷新页面查看红色分割线。")
    else:
        print(f"❌ 失败: {response.text}")

if __name__ == "__main__":
    mark_interrupter()
