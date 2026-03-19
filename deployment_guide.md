# NB Gas Price Dashboard - 部署与运维指南

本指南旨在帮助您将更新后的项目发布到 GitHub，并配置自动化运行环境，最终通过 Cloudflare 实现全球极速访问。

---

## 第一部分：将代码推送到 GitHub

当您在本地完成修改（例如运行 `python update_data.py` 验证成功后），请执行以下步骤将代码同步到 GitHub。

1.  **打开终端**（PowerShell 或 Git Bash），进入项目根目录。
2.  **查看状态**：
    ```bash
    git status
    ```
3.  **暂存更改**：
    ```bash
    git add .
    ```
4.  **提交更改**（写下您的修改说明）：
    ```bash
    git commit -m "Update: Added P2 prediction model, PWA support, and AST localization"
    ```
5.  **推送到 GitHub**：
    ```bash
    git push origin main
    ```

---

## 第二部分：GitHub 端的关键配置

为了让项目每天自动更新数据，您需要在 GitHub 仓库中开启必要的权限。

### 1. 开启自动化写权限 (Critical!)
默认情况下，GitHub Actions 可能没有权限将生成的 `data.json` 推送回您的仓库。
*   进入 GitHub 仓库页面。
*   点击 **Settings** (顶部菜单) -> **Actions** (左侧菜单) -> **General**。
*   滚动到最下方 **Workflow permissions** 部分。
*   选择 **"Read and write permissions"**。
*   点击 **Save**。

### 2. 检查自动化运行状态
*   点击顶部菜单的 **Actions** 选项卡。
*   您会看到名为 "Update Gas Data Daily" 的工作流。
*   如果想立即测试，可以点击左侧的工作流名称，然后点击右侧的 **Run workflow** 按钮。

---

## 第三部分：Cloudflare 配置指南

我们推荐使用 **Cloudflare Pages** 来托管此项目，因为它速度极快、完全免费，且自带 SSL 证书。

### 1. 关联仓库
*   登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
*   点击左侧菜单的 **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**。
*   选择您的 GitHub 账号和 `nb-gas-price-dashboard` 仓库。

### 2. 构建设置 (Build Settings)
*   **Project name**: `nb-gas-price-dashboard` (或自定义)
*   **Production branch**: `main`
*   **Framework preset**: `None`
*   **Build command**: (留空，因为我们已经通过 GitHub Actions 生成了静态文件)
*   **Build output directory**: `.` (表示根目录)
*   点击 **Save and Deploy**。

### 3. 配置自定义域名 (可选但推荐)
如果您有自己的域名：
*   在 Pages 项目页面点击 **Custom domains**。
*   点击 **Set up a custom domain**，输入您的域名（如 `gas.yourname.com`）。
*   Cloudflare 会自动为您处理 DNS 解析。

---

## 第四部分：常见问题排查 (Troubleshooting)

### Q1: 为什么网页上的数据没有更新？
*   **检查 GitHub Actions**：看看最近的一次工作流是否报错（红色叉号）。如果报错，点击进去查看 Python 运行日志。
*   **检查缓存**：Cloudflare 有强力缓存。如果您刚刚推送了代码，可能需要等待 1-2 分钟，或者尝试在无痕模式下打开网页。

### Q2: 为什么手机上没有弹出“添加到主屏幕”？
*   **HTTPS 要求**：PWA 必须在 HTTPS 环境下运行（Cloudflare Pages 默认开启）。
*   **访问频率**：部分浏览器（如 Chrome）要求您访问过该网页至少两次，且间隔一段时间，才会弹出提示。

### Q3: 本地运行脚本报错 `ModuleNotFoundError`？
*   请确保已运行安装命令：
    ```bash
    pip install pandas yfinance xlrd openpyxl
    ```

---
祝您的油价监控平台运行顺利！如有更多问题，请随时咨询。
