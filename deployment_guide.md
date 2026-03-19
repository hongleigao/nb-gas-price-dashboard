# NB Gas Price Dashboard - 部署与运维全指南

本指南将带您完成从代码提交、自动化配置到 Cloudflare Pages 全球上线的完整流程。本项目采用 **“代码与数据分离”** 架构，确保极致的稳定性和零冲突体验。

---

## 第一部分：GitHub 代码同步 (Standard Workflow)

当您在本地完成修改并运行 `python update_data.py` 验证成功后，执行以下命令同步到 GitHub：

1.  **提交代码**：
    ```powershell
    git add .
    git commit -m "Your descriptive message"
    ```
2.  **强制推送（仅限架构调整时使用，可打破机器人冲突）**：
    ```powershell
    git push origin main --force
    ```
    *注：强制推送会以您本地的版本为准覆盖云端，彻底解决由于机器人抢跑导致的推送拒绝问题。*

---

## 第二部分：GitHub 自动化权限配置 (Critical!)

为了让机器人能自动生成数据并发布网页，您必须开启以下权限：

1.  进入 GitHub 仓库页面 -> **Settings** -> **Actions** -> **General**。
2.  滚动到最下方 **Workflow permissions**。
3.  选择 **"Read and write permissions"**。
4.  勾选 **"Allow GitHub Actions to create and approve pull requests"**（如果存在该选项）。
5.  点击 **Save**。

---

## 第三部分：Cloudflare Pages 从零配置步骤

Cloudflare Pages 是托管本项目的最佳选择，它会自动从您的 `gh-pages` 分支抓取数据上线。

1.  **登录控制台**：访问 [dash.cloudflare.com](https://dash.cloudflare.com/)。
2.  **创建应用**：点击左侧菜单 **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**。
3.  **关联仓库**：选择您的 GitHub 账号和 `nb-gas-price-dashboard` 仓库。
4.  **核心构建设置 (Build Settings)**：
    *   **Project name**: `nb-gas-price-dashboard` (或自定义)。
    *   **Production branch**: 选择 **`gh-pages`** (注意：必须选这个分支，它是机器人生成的)。
    *   **Framework preset**: 选择 **`None`**。
    *   **Build command**: 留空 (不需要填写)。
    *   **Build output directory**: 填写一个点 **`.`** (表示根目录)。
5.  **保存并部署**：点击 **Save and Deploy**。

---

## 第四部分：常见问题与冲突解决

### 1. 为什么 GitHub 上没有 `gh-pages` 分支？
`gh-pages` 是由 GitHub Actions 自动生成的。
*   **解决**：点击仓库顶部的 **Actions** 选项卡，手动选择 "Update Gas Data and Deploy"，点击 **Run workflow**。等它跑完变成绿色勾号，分支就会出现。

### 2. 为什么 Cloudflare 部署失败？
*   请检查您的 **Production branch** 是否选成了 `main`。在我们的新架构中，`main` 只存代码，`gh-pages` 才存真正的网页和数据。请在 Cloudflare 项目设置中将其改回 `gh-pages`。

### 3. 数据显示为 0.0 或未更新？
*   这通常是因为 `data.json` 还是旧逻辑生成的。请在本地运行 `python .\update_data.py` 后执行强制推送 (`--force`)。

---
祝您的油价平台上线成功！如有疑问请随时咨询。
