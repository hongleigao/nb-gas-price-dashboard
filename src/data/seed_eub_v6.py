import subprocess
import os

DB_NAME = "nb-gas-db"

# 准备近期 EUB 调价数据 (2026年3月)
# 注意：V6.0 的 active_base 是存储当时调整所用的基准，通常在 45.42 左右
eub_seeds = [
    "INSERT INTO eub_history (commodity_id, effective_date, max_retail_price, active_base) VALUES ('gasoline', '2026-03-05', 158.4, 45.42);",
    "INSERT INTO eub_history (commodity_id, effective_date, max_retail_price, active_base) VALUES ('gasoline', '2026-03-12', 154.2, 45.42);",
    "INSERT INTO eub_history (commodity_id, effective_date, max_retail_price, active_base) VALUES ('gasoline', '2026-03-19', 151.8, 45.42);"
]

def main():
    temp_file = "eub_v6_temp.sql"
    with open(temp_file, "w") as f:
        f.write("\n".join(eub_seeds))
    
    print(f"正在同步 {len(eub_seeds)} 条 EUB 记录到 D1...")
    
    try:
        result = subprocess.run(
            ["npx", "wrangler", "d1", "execute", DB_NAME, "--file", temp_file, "--remote"],
            capture_output=True, text=True, check=True, shell=True, encoding='utf-8'
        )
        print("EUB 数据同步成功！")
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        print("同步失败:", e.stderr)
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)

if __name__ == "__main__":
    main()
