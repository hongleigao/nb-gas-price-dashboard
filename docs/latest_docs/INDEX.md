# NB Gas Price Dashboard - 完整项目文档导航

## 📚 文档概览

本文档集为 **NB Gas Price Dashboard** 项目的完整开发指南，包含架构设计、实现细节、部署指南和故障排查，适合以下受众：

- 🔧 **后端开发者** - 想理解 API 架构和 Cloudflare Workers 实现
- 🎨 **前端开发者** - 想扩展 React 组件和 UI
- 📊 **数据工程师** - 想修改 Python 数据管道
- 🚀 **运维人员** - 想部署和监控应用
- 🤖 **AI/自动化工具** - 想从零复现或扩展项目

---

## 📖 文档导图

```
latest_docs/
├── INDEX.md (本文件) .......................... 导航和快速入门
├── PROJECT_OVERVIEW.md ....................... ✨ 从这里开始！项目概览和技术栈
├── ARCHITECTURE.md ........................... 系统设计和核心概念
├── API_REFERENCE.md .......................... API 完整参考
├── BACKEND_GUIDE.md .......................... Workers 实现和数据库操作
├── FRONTEND_GUIDE.md ......................... React 组件和 UI 规范
├── DATA_PIPELINE.md .......................... Python 脚本和数据流
├── DEPLOYMENT.md ............................. 部署、配置、环境管理
├── TROUBLESHOOTING.md ........................ 故障排查和常见问题
└── KNOWN_ISSUES.md ........................... 已知问题、限制和规划功能
```

---

## 🚀 快速导航指南

### 我想...

#### 📋 理解整个项目
1. 先读 [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) - 5 分钟快速了解
2. 再看 [ARCHITECTURE.md](ARCHITECTURE.md) - 深度系统设计细节
3. 查看 [UI_DESIGN](../../UI_Design/) - 了解视觉设计

#### 🔌 开发 API 或扩展后端
1. [BACKEND_GUIDE.md](BACKEND_GUIDE.md) - Workers 和 D1 实现逻辑
2. [API_REFERENCE.md](API_REFERENCE.md) - 所有端点文档
3. [DATA_PIPELINE.md](DATA_PIPELINE.md) - 数据如何流入系统

#### 🎨 开发前端或 UI 组件
1. [FRONTEND_GUIDE.md](FRONTEND_GUIDE.md) - React 组件结构和设计规范
2. [ARCHITECTURE.md](ARCHITECTURE.md) 的"前端业务逻辑"章节 - 算法细节输出

#### 📊 改进数据管道
1. [DATA_PIPELINE.md](DATA_PIPELINE.md) - Python 脚本详解
2. [DEPLOYMENT.md](DEPLOYMENT.md) 的 GitHub Actions 章节 - 调度配置

#### 🚀 部署项目
1. [DEPLOYMENT.md](DEPLOYMENT.md) - 完整部署步骤
2. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - 常见部署问题

#### 🐛 遇到问题或错误
1. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - 故障排查步骤
2. [KNOWN_ISSUES.md](KNOWN_ISSUES.md) - 已知问题列表

#### 🤖 用 AI 工具重现或扩展项目
1. [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) - 快速上下文
2. [ARCHITECTURE.md](ARCHITECTURE.md) - 系统设计细节
3. [API_REFERENCE.md](API_REFERENCE.md) - API 规范
4. [BACKEND_GUIDE.md](BACKEND_GUIDE.md) + [FRONTEND_GUIDE.md](FRONTEND_GUIDE.md) - 核心实现
5. [DEPLOYMENT.md](DEPLOYMENT.md) - 编译和部署步骤

---

## ⚡ 5 分钟快速扫描

**项目是什么？**
- 一个实时预测加拿大新不伦瑞克省(NB)汽油价格的 Serverless 仪表盘
- 数据源：NYMEX RBOB 期货 + 官方 EUB 限价公告 + 汇率
- 算法：基于市场波幅和历史熔断模式推算价格变动风险

**技术栈？**
- 后端：Cloudflare Workers (Node.js) + D1 (SQLite)
- 前端：React 18 + Vite + Tailwind CSS + ECharts
- 数据：Python 3 + yfinance + pandas
- 部署：GitHub Pages + GitHub Actions (自动化)

**架构？**
```
用户浏览器
    ↓
GitHub Pages (React SPA)
    ↓
Cloudflare Workers API (业务逻辑)
    ↓
D1 SQLite 数据库
    ↑
Python 脚本 (GitHub Actions 定时运行)
    ↑
公开数据源 (yfinance, EUB Excel)
```

---

## 📖 文档约定

### 代码示例
- **敏感信息** (API key、密钥、路径) 用 `xxxxx` 替代
- **JavaScript/TypeScript** - 代码片段包含上下文和错误处理
- **Python** - 包含类型注解和文档字符串
- **SQL** - 标准 SQL 语法，兼容 SQLite

### 术语表

| 术语 | 定义 |
|------|------|
| **EUB** | Energy and Utilities Board of NB - 一个监管机构提供的官方汽油最高限价 |
| **RBOB** | Reformulated Blendstock for Oxygenate Blending - NYMEX 汽油期货代码 |
| **Interrupter** | 紧急熔断调整 - 官方非常规价格调调（通常在周四之外） |
| **Pump Price** | 加油站实际零售价格 (通常比 EUB Max Price 低 5-6 分) |
| **Cycle** | 一个 7 天的周期（周四到周三），用于计算风险预测 |
| **Benchmark** | 前一个周期的平均市场基准价格 |
| **Variance** | 价格变动幅度（相对或绝对值） |
| **D1** | Cloudflare 的 Serverless SQLite 数据库服务 |
| **Worker** | Cloudflare 的边缘计算节点，运行 JavaScript |

### 图表和符号
- 📘 信息块
- ⚠️ 注意/警告
- ❌ 反面例子
- ✅ 推荐做法
- 🔍 深度解析
- 💡 技巧和窍门

---

## 🔑 关键文件映射

| 功能 | 文件位置 |
|------|---------|
| 后端 API 路由 | `/api/src/router.js` |
| 周期计算算法 | `/api/src/handlers/cycle.js` |
| 历史查询算法 | `/api/src/handlers/history.js` |
| D1 数据库模式 | `/database/schema.sql` |
| 数据抓取脚本 | `/scripts/update_daily.py` |
| 前端主应用 | `/web/src/App.jsx` |
| Hero 看板组件 | `/web/src/components/HeroBoard.jsx` |
| 周期详情组件 | `/web/src/components/CycleDetails.jsx` |
| 历史图表组件 | `/web/src/components/HistoryChart.jsx` |
| 样式和主题 | `/web/src/index.css` |
| 构建配置 | `/web/vite.config.js` |
| Worker 配置 | `/api/wrangler.toml` |

---

## 📞 如何使用本文档

### 对于开发者
```bash
# 1. 克隆项目
git clone <repo-url>
cd nb-gas-price-dashboard

# 2. 先读 PROJECT_OVERVIEW.md 了解全局
# 3. 根据你的角色选择相关文档
# 4. 参考错误时查看 TROUBLESHOOTING.md
```

### 对于 AI/自动化工具
```
1. 按顺序读取：PROJECT_OVERVIEW → ARCHITECTURE → 专项文档
2. 参考 API_REFERENCE 理解数据格式
3. 按照 BACKEND_GUIDE + FRONTEND_GUIDE 实现功能
4. 使用 DEPLOYMENT 的脚本进行构建和部署
```

---

## ✅ 文档完整性检查清单

此文档集包含以下内容：

- ✅ 项目概览和架构图
- ✅ 完整的 API 接口规范
- ✅ 后端实现逻辑和数据库设计
- ✅ 前端组件、UI 规范和算法
- ✅ 数据管道和 ETL 流程
- ✅ 部署、配置和环境管理
- ✅ 故障排查和调试步骤
- ✅ 已知问题和限制
- ✅ 代码示例和最佳实践
- ✅ 贡献指南和工程规范

---

## 📝 文档维护

**最后更新**: 2026-03-31
**文档版本**: 1.0 (完整版)
**项目版本**: 7.0

如有遗漏或需要补充的内容，请参考项目根目录的 `CONTRIBUTING.md`。

---

**准备好开发了吗？** → [从这里开始 → PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)
