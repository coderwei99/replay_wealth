# Git Commit 规范

本项目采用 [Conventional Commits](https://www.conventionalcommits.org/)（业界常用约定式提交），并由 **commitlint + husky** 在 `commit-msg` 钩子中强制校验。

## 核心原则

1. **一条 commit 只做一件事**  
   功能、样式、脚本、重构、文档不要混在同一提交里。  
   例如：修引号规范与改默认倍速应拆成两条 commit。

2. **标题说清「做了什么」**  
   用祈使语气、现在时（如「添加」「修复」），避免「修改了」「已完成」等含糊表述。

3. **本地配置不提交**  
   个人 AppID、本机代理、私密密钥等不要写入仓库（如 `project.config.json` 中的个人 appid）。

## 提交格式

```text
<type>(optional-scope): <subject>

[optional body]

[optional footer]
```

- `type`：必填，见下表  
- `scope`：可选，改动范围（如 `compare`、`chart`、`playback`）  
- `subject`：必填，简短说明，**不超过约 50 个汉字 / 72 字符**  
- 标题行末尾**不加句号**  
- 正文与标题之间空一行；正文可解释「为什么」，而非复述 diff  

### type 一览

| type | 含义 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 多资产对比图支持动画回放` |
| `fix` | 修复缺陷 | `fix: 结果页布局与回放稳定性` |
| `docs` | 仅文档 | `docs: 补充 commit 规范说明` |
| `style` | 格式/样式（不影响逻辑） | `style: 将 JSX 属性引号统一为单引号` |
| `refactor` | 重构（非 feat / fix） | `refactor: 抽取行情请求错误处理` |
| `perf` | 性能优化 | `perf: 降低图表重绘频率` |
| `test` | 测试相关 | `test: 补充收益计算单测` |
| `build` | 构建/打包/依赖 | `build: 升级 taro 到 4.2` |
| `ci` | CI 配置 | `ci: 添加 lint 工作流` |
| `chore` | 杂项工具与工程配置 | `chore: 添加 ESLint lint 与 format 脚本` |
| `revert` | 回滚某次提交 | `revert: 回滚默认倍速调整` |

### 推荐示例

```text
feat: 将回放默认倍速调整为 0.5x

降低默认播放速度，便于更清晰地查看收益曲线变化。
```

```text
feat(compare): 多资产结果页接入回放控件与上下布局

排名、曲线、播放控制纵向排布，并随进度刷新实时排名。
```

```text
style: 对比排名盈亏色改为红涨绿跌

与单资产回放及 A 股展示习惯保持一致。
```

```text
chore: 添加 ESLint lint 与 format 脚本

便于用 npm run format 自动修复 jsx-quotes 等规范问题。
```

### 反例（勿用）

```text
# 类型缺失 / 非约定 type
update code
修复bug
WIP

# 一条 commit 塞多件事
feat: 加回放控件并改引号修 appid

# 标题含糊
fix: 改一下
chore: 更新
```

## 拆分建议

| 改动类型 | 建议 type | 是否单独 commit |
|----------|-----------|-----------------|
| 新功能 / 行为变化 | `feat` | 是 |
| 缺陷修复 | `fix` | 是 |
| 纯格式（引号、缩进、颜色 token） | `style` | 是 |
| 脚本 / husky / eslint 配置 | `chore` | 是 |
| 仅 README / 规范文档 | `docs` | 是 |
| 无关本地配置 | — | **不要提交** |

同一需求若包含「实现 + 接线页面 + 纯样式」，优先拆成多条 commit，而不是一条巨型提交。

## 工具链

| 文件 / 工具 | 作用 |
|-------------|------|
| `commitlint.config.mjs` | 继承 `@commitlint/config-conventional` |
| `.husky/commit-msg` | 提交时运行 `commitlint` |
| `npm run prepare` | 安装 husky 钩子 |

提交被拒绝时，请按本文件修正 message 后重新 `git commit`（可用 `git commit --amend` 仅在尚未 push、且仅改 message 时使用）。

## 与分支的关系

- 日常开发在功能分支或 `main` 上均可，但 **message 规范一致**  
- push 前确认：历史清晰、无密钥、无无关本地文件  

---

参考：[Conventional Commits 1.0.0](https://www.conventionalcommits.org/zh-hans/v1.0.0/) · [Angular 提交说明](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit)
