# NB Gas Price Pulse - 部署与运维实战指南 (V5.1)

本项目已进化为 **“云原生 Serverless”** 架构：GitHub Actions 负责数据推送，Cloudflare D1 负责存储，Cloudflare Worker 负责逻辑计算。

---

## 一、 GitHub Actions 配置 (必须完成)

### 1. 开启自动化写权限
为了让 Action 能够将网页更新推送到 `gh-pages` 分支：
1.  进入仓库 **Settings** -> **Actions** -> **General**。
2.  在 **Workflow permissions** 中，选择 **"Read and write permissions"**。
3.  点击 **Save**。

### 2. 配置仓库机密 (Repository Secrets)
必须配置以下三个变量，否则数据同步将失败：
*   `CLOUDFLARE_ACCOUNT_ID`: 您的 Cloudflare 账户 ID。
*   `CLOUDFLARE_DATABASE_ID`: D1 数据库的 UUID。
*   `CLOUDFLARE_API_TOKEN`: 具有 D1 编辑权限的 API 令牌。

---

## 二、 Cloudflare 基础设施部署

### 1. D1 数据库初始化
1.  在 Cloudflare 控制台创建 D1 数据库。
2.  执行 `schema.sql` 中的 SQL 语句初始化表结构。
3.  本地运行 `python seed_history.py` 和 `python seed_eub_history.py` 注入历史压舱石数据。

### 2. Worker 计算大脑部署
1.  创建一个新的 Cloudflare Worker。
2.  在 **Settings** -> **Variables** -> **D1 database bindings** 中，将数据库绑定为变量名 **`D1_DB`**。
3.  将项目中的 `worker.js` 代码粘贴到编辑器中并部署。

---

## 三、 前端部署 (GitHub Pages)

1.  确保 `index.html` 中的 `API_ENDPOINT` 已指向您的真实 Worker URL。
2.  将代码推送至 GitHub `main` 分支。
3.  GitHub Actions 会自动将静态页面部署到 `gh-pages` 分支。

---

## 四、 移动端安装 (PWA)

*   **iOS**: 在 Safari 中点击“分享” -> **“添加到主屏幕”**。
*   **Android**: 在 Chrome 中点击菜单 -> **“安装应用”**。
*   安装后，应用将具备离线缓存功能和独立的启动画面。

---
祝您的云原生油价监控平台运行顺利！
