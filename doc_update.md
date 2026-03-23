# 项目文档同步指南 (Agent Reference)

由于本项目架构已演进为 **V5.1 (Cloud Native)**，后续 AI 助手在维护时，应遵循以下文档优先级。

---

## 核心参考优先级
1.  **`ARCHITECTURE.md` (P0)**: 系统的“宪法”。包含最新的数据流、SQL 结构、M14 预测公式及归因逻辑。所有代码修改应以此为准。
2.  **`CONTRIBUTING.md` (P1)**: 运维与环境搭建手册。包含如何运行“Pusher”脚本及 D1 初始化流程。
3.  **`The_Next_Step.md` (P1)**: 路线图。记录了已完成的任务和未来的演进方向。

## 维护任务提示词 (Prompts)

### 任务：全量扫描
> “请阅读 `ARCHITECTURE.md`，并确保 `update_data.py` (Pusher)、`worker.js` (Brain) 和 `index.html` (UI) 的逻辑与文档描述的第一性原理完全一致。”

### 任务：路线图更新
> “查看 `The_Next_Step.md`，检查是否有新完成的 Feature，并根据当前的技术债务提出 V5.2 阶段的优化建议。”

---
*Created by Gemini CLI - Engineering Standard Module*
