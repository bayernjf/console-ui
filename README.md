# @bayjf/console-ui

Tier 0 家族的**设计令牌单一事实源**（深色工业风：steel 色阶、power/data/ok/warn/alert、
ink、字体、bevel/hair）。首次落地对应 UI/UX 评审（2026-10-30）P1 #4。

> 与 `@bay/landing-ui` 的边界：landing-ui 服务 24 个公开 `*-landing` 落地页（`--lui-*`
> 浅色营销面 + Astro 组件，git tag 依赖）；console-ui 只服务内部运营台/控制台
> （ops-console、model-hub 等深色 React/Astro 混合应用），只输出 token 变量。
> 两套变量不交叉，控制台的 D 档语义色不进公开落地页。

## 为什么不是 npm 包

各产品仓要能离线构建、CI 不引入私有 registry 或跨仓 checkout，所以采用
**生成式同步 + 哈希锁定**：令牌块由本仓生成，消费方内嵌并记录 `tokens.lock`，
消费方 CI 只做一致性校验。将来需要按版本号分发时再升级为 git tag 依赖。

## 使用

```bash
npm run sync            # 把 tokens.css 的 :root 块写入所有消费方 + 刷新 lock + 同步校验脚本
npm run check           # 只校验（发现漂移退出码 1）
```

消费方在 `package.json` 里挂：

```json
"scripts": { "check:tokens": "node scripts/check-tokens.mjs" }
```

并在 CI 增加一步 `npm run check:tokens`。`scripts/check-tokens.mjs` 由 sync 复制，
不要手改。

## 内嵌块长这样

```css
/* @bayjf/console-ui:begin — generated from bayjf/console-ui; do not edit by hand */
:root { … }
/* @bayjf/console-ui:end */
```

令牌之外的组件样式（`.btn`、`.panel`、`.tag`、表格、表单）仍留在各产品仓，
按评审建议"先合并令牌、再逐步收编"。

## 当前消费方

| 仓 | 文件 |
|---|---|
| ops-console | `src/styles/tokens.css` |
| model-hub | `apps/hub/web/src/styles/tokens.css` |

新增消费方：在 `scripts/sync.mjs` 的 `CONSUMERS` 加一项，跑 `npm run sync`。

## 改令牌的流程

1. 在本仓改 `tokens.css`；
2. `npm run sync`；
3. 本仓与每个消费方各提一个原子提交（英文 conventional message）。
