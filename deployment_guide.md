# NB Gas Price Dashboard - 部署与运维实战指南 (V4.0)

本项目采用 **“代码与数据分离”** 的专业级架构，彻底解决了手动代码维护与自动化数据更新之间的推送冲突。

---

## 一、 GitHub 核心配置 (必须完成)

### 1. 开启自动化写权限
为了让机器人能将生成的 `data.json` 推送到 `gh-pages` 分支：
1.  进入仓库 **Settings** -> **Actions** -> **General**。
2.  在 **Workflow permissions** 中，选择 **"Read and write permissions"**。
3.  点击 **Save**。

### 2. 激活 gh-pages 分支
1.  点击顶部 **Actions** 选项卡。
2.  选择 **Update Gas Data and Deploy** 工作流。
3.  点击右侧 **Run workflow** 下拉按钮并执行。
4.  运行成功后，仓库会自动创建一个 `gh-pages` 分支。

---

## 二、 Cloudflare Pages 全自动上线

1.  **关联仓库**：在 Cloudflare Pages 菜单选择 **Connect to Git**。
2.  **关键构建设置 (Build Settings)**：
    *   **Production branch**: 必须手动修改为 **`gh-pages`**。
    *   **Framework preset**: 选 `None`。
    *   **Build command**: 保持 **留空** (脚本在 GitHub 已跑完)。
    *   **Build output directory**: 填写一个点 **`.`**。
3.  **自动部署**：一旦配置完成，未来您在 `main` 分支推代码，Cloudflare 会在 1 分钟内同步更新结果。

---

## 三、 专家级冲突解决：Git Pull Rebase

如果因为机器人运行导致您在 `main` 分支推送失败（尽管几率已极低），请执行：

1.  **撤销任何卡住的状态**：`git rebase --abort`
2.  **强行对齐云端数据**：
    ```powershell
    git pull origin main --rebase -X ours
    ```
    *注：这会保留您的本地代码修改，同时吸纳云端由于自动更新产生的 data.json 变动。*
3.  **重新生成数据并推送**：
    ```powershell
    python update_data.py
    git add .
    git commit -m "Fix: Synced logic and data"
    git push origin main
    ```

---

## 四、 常见运维排障

*   **Cloudflare 部署显示 Skipped**：检查 `.github/workflows/main.yml` 是否已移除 `[skip ci]` 标签。当前版本已移除此标签以确保部署。
*   **本地报错 ModuleNotFoundError**：执行 `pip install pandas yfinance xlrd openpyxl`。
*   **数据显示超前一天**：确保 `update_data.py` 中的 `America/Moncton` 时区锁定代码未被修改。

---
祝您的油价监控平台运行顺利！
