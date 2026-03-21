# 项目文档自动更新任务清单 (Automation TODO)

如果您在新的会话中重新启动此项目，请将以下“提示词”发送给 AI 助手，以确保所有项目文档同步至最新状态。

---

## 任务 1：同步技术白皮书 (Project_idea.md)
**提示词：**
> “请重新扫描当前项目代码，并根据 `update_data.py` 和 `index.html` 的最新实现更新 `Project_idea.md`。重点确保以下内容准确：
> 1. 预测算法已更新为 **Beta 0.48 校准模型**。
> 2. 零售价差分析已更新为 **8周中位数基准法 (Median-based Spread)**。
> 3. 架构部分描述了 **代码/数据分离 (main/gh-pages)** 模式。
> 4. 包含 **PWA 骨架屏 (Skeleton Loader)** 的 UX 描述。”

---

## 任务 2：同步部署指南 (deployment_guide.md)
**提示词：**
> “请阅读 `deployment_guide.md` 并根据最新的项目架构进行核对。确保文档包含：
> 1. 如何在 GitHub Actions 中开启 **Read and Write permissions**。
> 2. 如何在 Cloudflare Pages 中将 **Production branch** 设置为 `gh-pages` 分支。
> 3. 处理 GitHub Actions 机器人抢跑导致本地推送冲突的 **`git pull --rebase -X ours`** 终极解决方案。
> 4. 强调 `main.yml` 中已移除 `[skip ci]` 标签以确保护触发 Cloudflare 自动部署。”

---

## 任务 3：同步路线图 (The_Next_Step.md)
**提示词：**
> “请阅读 `The_Next_Step.md`，并将已完成的任务标记为完成（Done），并根据最新的产品洞察添加新的建议。
> **当前状态核对：**
> - 已完成：骨架屏加载、图表交互降噪、灵敏度算法校准、PWA 支持、AST 本地化。
> - 待办重点：多能源品种（柴油/取暖油）支持、加油指数 (Refuel Meter)、社交分享图片生成。”

---

## 任务 4：全局扫描与一致性检查
**提示词：**
> “请检查项目内所有 Markdown 文档（README, Project_idea, deployment_guide 等）中的技术参数（如 0.48 Beta, 15% HST, 8-week median）是否完全一致，如果不一致，请以代码 `update_data.py` 为准进行全量同步。”

---
*Created by Gemini CLI - Context Management Module*