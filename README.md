# Replay Wealth · 投资收益回放（微信小程序）

基于 **Taro 4 + React + TypeScript** 的微信小程序：可视化一笔 **A 股** 投资从买入到指定日期的收益变化。

## v1 范围

- **仅 A 股**（沪 / 深 / 北 + 场内 ETF）
- 不包含美股、加密货币（架构已预留）

## 功能

- 单资产回放：代码、买入日期、投入金额（CNY）、截止日期
- 收益曲线：Canvas 绘制持仓价值曲线（非 K 线）
- 收益统计：投入、当前价值、累计收益、收益率、最大回撤、年化
- 动画回放：曲线逐步绘制，日期与统计同步
- 多资产对比：同日期同金额排名

## 扩展架构（重要）

行情层采用 **市场适配器**，各市场最终映射到统一结构 `HistoryResponse`：

```ts
interface HistoryResponse {
  symbol: string
  name: string
  market: 'CN' | 'US' | 'CRYPTO'
  currency: 'CNY' | 'USD' | string
  provider: string
  prices: PricePoint[]  // date / time / close / open? / high? / low?
}
```

| 市场 | 适配器 | v1 状态 | 计划数据源 |
|------|--------|---------|------------|
| CN | `utils/market/cn.ts` | ✅ 已实现 | 腾讯日 K（主）/ 东方财富（备） |
| US | `utils/market/us.ts` | ⏳ 占位 | Yahoo / 自建代理 |
| CRYPTO | `utils/market/crypto.ts` | ⏳ 占位 | CoinGecko / Binance |

启用新市场时：

1. 在 `utils/assets.ts` 的 `ENABLED_MARKETS` 中加入 `'US'` 或 `'CRYPTO'`
2. 在对应 adapter 中实现 `fetchHistory`，**返回同一套 `HistoryResponse`**
3. 补充 `ASSET_PRESETS` 预设即可，上层计算与 UI 无需改协议

## 开发

```bash
npm install
npm run dev:weapp
```

1. 用微信开发者工具导入本项目根目录
2. AppID 可用测试号
3. 开发阶段 `urlCheck: false`，便于请求行情接口

生产环境请配置 request 合法域名：

- `https://web.ifzq.gtimg.cn`（主源：腾讯）
- `https://push2his.eastmoney.com`（备源：东财，部分网络不可达）

> 若本机开了 Clash / Surge 等代理，东财 `push2his` 常见 `Empty reply`；可在代理里对 `*.eastmoney.com` 设 DIRECT，或直接依赖腾讯主源。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev:weapp` | 微信小程序开发 |
| `npm run build:weapp` | 生产构建 |
| `npm run lint` | ESLint 检查 |
| `npm run format` | ESLint 自动修复（含 jsx-quotes） |

## Commit 规范

提交信息遵循 **Conventional Commits**，**一条 commit 只做一件事**。  
完整规则见根目录 [COMMIT_CONVENTION.md](./COMMIT_CONVENTION.md)。

本地由 husky + commitlint 校验 `commit-msg`，不符合约定的提交会被拦截。

## 目录

```
src/
  pages/index/           # 主页面
  components/            # 图表 / 统计 / 回放 / 对比
  utils/
    assets.ts            # 预设标的 + ENABLED_MARKETS
    calc.ts              # 收益计算（与市场无关）
    market/
      index.ts           # 统一 fetchHistory 入口
      cn.ts              # A 股适配器
      us.ts              # 美股占位
      crypto.ts          # 加密货币占位
      types.ts           # MarketAdapter 协议
```

## 说明

本工具仅供研究娱乐，不构成投资建议。行情数据来自第三方，不保证完整与实时。
