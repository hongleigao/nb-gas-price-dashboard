# NB Gas Price Pulse - 部署与运维实战指南 (V4.6)

本项目采用 **“代码与数据分离”** 架构，使用 GitHub Actions 进行计算，Cloudflare Pages 进行全球加速。

---

## 一、 GitHub 核心配置 (必须完成)

### 1. 开启自动化写权限
为了让机器人能将数据推送到 `gh-pages` 分支：
1.  进入 GitHub 仓库 **Settings** -> **Actions** -> **General**。
2.  在 **Workflow permissions** 中，选择 **"Read and write permissions"**。
3.  点击 **Save**。

### 2. 移除 [skip ci] 逻辑
当前版本的 `.github/workflows/main.yml` 已移除了 `[skip ci]` 标签。这确保了当机器人更新数据时，Cloudflare Pages 能够正确检测到变动并触发自动部署。

---

## 二、 Cloudflare Pages 全自动上线

1.  **关联仓库**：在 Cloudflare 控制台选择 **Workers & Pages** -> **Connect to Git**。
2.  **核心构建设置 (Build Settings)**：
    *   **Production branch**: 必须手动修改为 **`gh-pages`** (不要选 main)。
    *   **Framework preset**: 选 `None`。
    *   **Build command**: 保持 **留空**。
    *   **Build output directory**: 输入一个点 **`.`**。
3.  **自定义域名**：建议在 **Custom domains** 选项卡中添加您的子域名（如 `gas.jgao.app`）。

---

## 三、 专家级冲突解决 (Git Rebase)

如果在 `main` 分支推送代码时遇到 `[rejected]` 错误，请执行以下命令强制以本地代码为准并同步云端数据：

1.  **重置冲突状态**：`git rebase --abort`
2.  **拉取并重排提交**：
    ```powershell
    git pull origin main --rebase -X ours
    ```
3.  **一气呵成推送**：
    ```powershell
    python update_data.py
    git add .
    git commit -m "Fix: Synced data and logic"
    git push origin main
    ```

---

## 四、 移动端安装 (PWA)

*   **iOS**: 在 Safari 中点击“分享”按钮 -> **“添加到主屏幕”**。
*   **Android**: 在 Chrome 中点击菜单按钮 -> **“安装应用”**。
*   安装后，应用将以 **“Gas Pulse”** 命名，并具备独立的启动画面。

---
祝您的油价监控平台运行顺利！
