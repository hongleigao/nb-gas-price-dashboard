import os
import requests
import json

CF_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
CF_DATABASE_ID = os.environ.get('CLOUDFLARE_DATABASE_ID')
CF_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')

def debug_db():
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DATABASE_ID}/query"
    headers = {"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"}
    
    # 查出最后 5 条监管记录
    sql = "SELECT * FROM eub_regulations ORDER BY effective_date DESC, id DESC LIMIT 5"
    response = requests.post(url, headers=headers, json={"sql": sql})
    
    if response.ok:
        data = response.json()
        results = data.get("result", [{}])[0].get("results", [])
        print("--- EUB Regulations 表最后 5 条记录 ---")
        for r in results:
            print(f"ID: {r['id']} | Date: {r['effective_date']} | Max: {r['max_retail_price']} | Base: {r['active_eub_base']}")
    else:
        print(f"❌ 调试失败: {response.text}")

if __name__ == "__main__":
    debug_db()
