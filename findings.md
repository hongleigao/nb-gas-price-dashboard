# 发现与决策 (算法优化专项)

## 需求
- 降低预测 MAE (当前约 1.58¢)。
- 提升“极端涨幅”情况下的捕捉能力。
- 定义一种能直接转化为“Buy/Wait”信号的算法输出。

## 研究发现 (待补充)
- **V4.0 基准表现**：BETA=0.48, 方向准确率 80%, MAE 1.58¢。
- **痛点**：在市场急剧反转时，平滑系数导致预测滞后。

## 技术决策
| 决策 | 理由 |
|------|------|
| **引入残差历史记录** | 算法工程师建议：通过分析过去 3 周的误差方向，判断是否存在系统性 Margins 变动 |

## NB EUB 物理定价组件 (2026-03-22 快照)

| 组件名称 | 数值 (¢/L) | 备注 |
|------|------|------|
| **Wholesale Margin** | 6.51 | 固定 |
| **Retail Margin** | 8.46 | 最大限额 |
| **Delivery Cost** | 3.75 | 最大限额 |
| **Federal Excise** | 10.00 | 固定 |
| **Provincial Tax** | 10.87 | NB省固定 |
| **Carbon Price (Consumer)** | 0.00 | **于 2025-04-01 正式取消** |
| **CFR Adjustor (New Carbon)** | 8.00 | 2025年12月后引入，替代消费碳税 |
| **HST** | 1.15x | 作用于总和 |

## 中断条款 (Interrupter Clause) 逻辑研究

- **触发条件**：当 NYMEX RBOB 基准价或其替代现货价格相较于上周定价基数变动超过 **±6.0¢/L** 时，NB EUB 有权启动中断条款。
- **历史数据点**：在市场剧烈波动期（如 2024 年 Q4），该条款常被用于在常规周四定价日之前（通常是周六或周日）提前进行价格修正。
- **算法建模建议**：模型不应预测中断，但应监测 `Daily Change`。若累计变动达到 5.5¢，应在前端弹出“High Risk of Interrupter Clause”警告。

## NYH Basis (基差) 逻辑研究

- **定义**：NYMEX RBOB Futures 与 New York Harbor (NYH) Spot Price 之间的差值。
- **平均偏差**：历史 Basis 波动在 **0.5¢ - 1.2¢/L** 之间。
- **校准方法**：利用过去 21 天的 `current_spread` 与 `Historical Median Spread` 的差值来动态吸收 Basis 偏移。

## 算法回测最终结论 (2026-03-21)

### 实验结果
- **M7 (V4.0 Baseline)**: **胜出**。方向准确率 78.9%，MAE 1.62。证明了 Beta 0.48 是极其稳健的平滑参数。
- **M13 (Physical)**: **严重失败**。MAE 11.4。证明了由于参数过多且基准差不稳定，物理累加法在现实中不可行。

### 最终优化路径
1. **停止物理建模**：维持 M7 作为唯一的生产环境预测引擎。
2. **监测中断条款 (Interrupter Clause)**：未来唯一可以增加的逻辑是“波动监测”，而非“预测微调”。当 RBOB 日内波动 > 6.0¢ 时，触发前端警告提示“Interruptor Clause 可能触发”。

## UI/UX 深度审计建议 (基于 frontend-skill)

### 1. 核心设计语言 (Visual Thesis)
- **Mood**: **Precision & Calm** (精准且冷静，消除油价波动的焦虑感)。
- **Material**: **Glassmorphism & Depth** (磨砂玻璃与深度感，营造高级的数字化面板体验)。
- **Energy**: **Proactive & Decisive** (主动且果断，让用户第一眼获得“Buy or Wait”的明确指令)。

### 2. 内容重构计划 (Content Plan)
- **Hero (Decide)**: 
  - 将 `Weekly Forecast` 升级为全宽/大面积的 **Actionable Banner**。
  - 主标题不再是“Weekly Forecast”，而是直接给出操作建议，例如：“**Buy Now: Price spike expected this Thu.**” 或 “**Wait: Downward trend detected.**”。
  - 核心预测数值（如 +2.5¢）通过巨大的字体（48px+）展示，并配备背景光效（Glow）。
- **Support (Monitor)**: 
  - 将 `NB Price` 和 `Benchmark` 合并为一个紧凑的“对比卡片 (Compare Block)”。
  - 弱化具体的“¢”单位文字，突出数字本身。
- **Detail (Insight)**: 
  - `Retail Spread` 部分不再使用卡片。改用 **Inline Bar** 或 **Progress Gauge** 展示“零售效率”，直观体现“当前油价是否公平”。
- **Context (Historical)**: 
  - 图表占据页面的下半部分，取消容器边框，实现 **Full-bleed chart** 效果，让数据流向屏幕边缘。

### 3. 交互与动画 (Interaction Thesis)
- **Reveal Sequence**: 
  - 页面加载时，Hero 卡片从 50px 处以 `Ease-out` 轨迹滑入。
  - 数字从 0 开始跳动（CountUp），体现“动态计算”的过程感。
- **Haptic Affordance**: 
  - 悬停在数据卡片上时，卡片背景产生轻微的 `Scale(1.02)` 变化，并增强阴影深度。
- **Data Brushing**: 
  - 在 ECharts 图表上移动时，使用自定义的 HTML Overlay 替代原有 Tooltip，布局更像“交易终端”。

### 4. 视觉优化 (Visual Excellence)
- **Typography**: 引入无衬线字体家族（推荐 Inter 或 SF Pro Display），通过 `ExtraBold` (800) 强化标题，`Medium` (500) 处理辅助文字。
- **Colors**: 
  - 严控色值：上涨使用 `Danger Red (#FF4D4F)`，下跌使用 `Success Green (#52C41A)`，平均水平使用 `Neutral Gray (#8C8C8C)`。
  - 为背景增加微妙的 **Dot Matrix (点阵背景)**，增强工业感。
- **Icons**: 取消彩色背景图标，统一使用线条感的 `Feather Icons` 或 `Lucide Icons`。
