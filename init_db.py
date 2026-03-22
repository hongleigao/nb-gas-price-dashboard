import os
import requests

CF_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
CF_DATABASE_ID = os.environ.get('CLOUDFLARE_DATABASE_ID')
CF_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')

def init_db():
    if not all([CF_ACCOUNT_ID, CF_DATABASE_ID, CF_API_TOKEN]):
        print("❌ 错误: 缺少环境变量")
        return

    with open('schema.sql', 'r', encoding='utf-8') as f:
        sql_content = f.read()

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DATABASE_ID}/query"
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # D1 API 支持批量执行 SQL
    payload = {
        "sql": sql_content
    }
    
    print(f"正在同步 Schema 到数据库 {CF_DATABASE_ID}...")
    response = requests.post(url, headers=headers, json=payload)
    result = response.json()
    
    if response.ok and result.get("success"):
        print("✅ 数据库 Schema 初始化成功！")
    else:
        print(f"❌ 初始化失败: {result.get('errors')}")

if __name__ == "__main__":
    init_db()
