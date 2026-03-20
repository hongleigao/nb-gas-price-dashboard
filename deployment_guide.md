# NB Gas Price Dashboard - 部署与运维实战指南

本指南面向开发者及维护者，详细说明如何管理本项目、配置自动化流程以及通过 Cloudflare 发布。本项目采用 **“代码与数据分离”** 架构，从根本上杜绝了 Git 推送冲突。

---

## 一、 开发与代码同步 (GitHub main 分支)

所有代码层面的修改（`.py`, `.html`, `.yml`, `.py`）均在 `main` 分支进行。

1.  **本地运行验证**：
    ```powershell
    python update_data.py
    ```
2.  **推送代码**：
    ```powershell
    git add .
    git commit -m "Your message"
    git push origin main
    ```
    *注：由于新架构采用了独立的数据分支，您推送到 main 时永远不会再遇到 [rejected] 冲突。*

---

## 二、 自动化与权限配置 (GitHub Actions)

为了让机器人每天凌晨 4 点 (AST) 自动抓取数据，必须确保以下权限已开启：

1.  进入 GitHub 仓库 -> **Settings** -> **Actions** -> **General**。
2.  在 **Workflow permissions** 中，选择 **"Read and write permissions"**。
3.  点击 **Save**。

*机器人会将运行结果（index.html 和 data.json）自动推送到 **gh-pages** 分支。*

---

## 三、 线上托管配置 (Cloudflare Pages)

我们使用 Cloudflare Pages 实现全球分发和自动更新。

1.  **创建应用**：在 Cloudflare 控制台选择 **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**。
2.  **关键构建设置 (Build Settings)**：
    *   **Production branch**: 必须选择 **`gh-pages`**。
    *   **Framework preset**: 选 `None`。
    *   **Build command**: (保持为空)。
    *   **Build output directory**: 输入一个点 **`.`**。
3.  **自定义域名**：在 **Custom domains** 选项卡中添加您的子域名（如 `gas.jgao.app`）。

---

## 四、 常见问题排查 (Troubleshooting)

### 1. 网页内容显示旧数据或 -- 0.0？
*   **原因**：本地 `data.json` 仍是旧逻辑生成的版本。
*   **解决**：在本地运行 `python update_data.py`，确认 `nymex_delta` 不为 0.0，然后执行 `git add .`, `git commit`, `git push`。机器人会自动在 `gh-pages` 分支覆盖掉坏数据。

### 2. Cloudflare 部署显示 "Skipped"？
*   **原因**：提交消息中包含了 `[skip ci]` 标签。
*   **解决**：我们已在最新的 `main.yml` 中移除了此标签。请确保您的本地 `.github/workflows/main.yml` 是最新版。

### 3. 如何在手机上安装？
*   使用手机浏览器（Safari 或 Chrome）访问您的域名。
*   点击 **“分享”** 图标（iOS）或 **“菜单”** 图标（Android）。
*   选择 **“添加到主屏幕 (Add to Home Screen)”**。

---
祝您的油价监控平台运行顺利！
