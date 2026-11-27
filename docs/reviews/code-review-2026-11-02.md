# 代码评审报告 — console-ui（2026-11-02）

评审方式：深度只读。未修改任何源码，未执行任何 git 写操作，未真实执行会改写下游仓的 `npm run sync`；所有验证均为只读（`--check`、`node --check`、哈希计算、diff、对比度计算）。

## 一、仓库定位与规模概览

`console-ui`（`@bayjf/console-ui`，private，version 0.1.0）是 Tier 0 深色工业风设计令牌的权威源仓。定位（README.md:1-16）：不做 npm 包分发，采用"生成式同步 + 哈希锁定"——本仓 `tokens.css` 的 `:root` 块为单一事实源，由 `scripts/sync.mjs` 推送到兄弟目录下的消费仓，消费仓内嵌令牌块并以 `tokens.lock`（SHA-256）钉住哈希，消费仓 CI 用被复制的 `scripts/check-tokens.mjs` 做一致性校验。

仓库共 6 个文件（不含 .git）：

| 文件 | 行数 | 用途 |
|---|---|---|
| `tokens.css` | 41 | 令牌源：steel 8 级、power/data/ok/warn/alert/plasma、ink 3 级、字体、bevel/hair |
| `scripts/sync.mjs` | 144 | 同步/校验脚本（`--check` 只读模式） |
| `scripts/check-tokens.mjs` | 44 | 复制到消费仓的漂移校验器 |
| `package.json` | 11 | `sync` / `check` 两个脚本，无依赖、无 exports/files |
| `README.md` | 57 | 工作流说明 |
| `.github/workflows/ci.yml` | 23 | CI：仅 `node --check` 语法检查 |

Git 历史 3 个提交（当前分支 dev）：`466415f feat: canonical Tier 0 design tokens with consumer sync` → `9acacdc ci: syntax-check the token sync scripts` → `a27f18f fix(tokens): raise ink-faint to pass AA`（HEAD）。

消费方 2 个（scripts/sync.mjs:26-35 硬编码）：`ops-console`（`src/styles/tokens.css`）与 `model-hub`（`apps/hub/web/src/styles/tokens.css`）。

## 二、结论摘要

问题计数：**P0 = 0，P1 = 2，P2 = 4，P3 = 3**。

最关键 3 条：

1. **P1 — 同步是静默部分成功且无原子性**：`sync.mjs:111-114` 对缺失消费仓仅 `console.warn` 后继续；写文件与写 lock 分两步（135-137），中途失败会留下半同步状态；同步成功退出码恒为 0，脚本化调用无法感知跳过。
2. **P1 — `--ink-faint` 的 AA 修复在最深背景上达标，但在 `--steel-800` 上仅 4.67:1，处于 AA 边缘**；且两个 dim 语义色（`--data-dim`、`--power-dim`）在任何 steel 背景上都不达 AA（2.85 / 2.92），若被当正文色使用即违规——tokens.css 无任何注释说明这些颜色的允许用法。
3. **P2 — CI 门基本为空转**：本仓 CI 只做 `node --check` 语法检查（ci.yml:23），不校验 tokens.css 本身的合法性/对比度，也不验证 `--check` 在"消费仓缺失"场景下的行为（尽管 ci.yml:17-21 注释声称如此）；真正的漂移门全部依赖消费仓自己挂 `check:tokens`（已确认两仓 CI 都挂了，但这是约定而非法保）。

## 三、逐条发现

### P1-1 同步非原子、缺失消费仓静默跳过

- **位置**：scripts/sync.mjs:109-139
- **证据**：
  - `111-114`：`if (!existsSync(file)) { console.warn('skip (missing)'); continue; }` —— 消费仓不存在时只警告不报错，`checkOnly=false` 时退出码仍为 0。
  - `135-137`：先 `writeFileSync(file, ...)` 再 `writeFileSync(tokens.lock)` 再 `copyChecker`——三步无事务，第二步崩溃即留下"块已更新、lock 旧"的损坏态（此时消费仓 CI 会报漂移，但本仓无任何修复指引）。
  - `123-128`：哈希一致时仍重写 lock 与 checker（幂等输出），但 `copyChecker` 的 `mkdirSync(recursive)` 会在消费仓里静默创建 `scripts/` 目录——若路径配置错误，会在错误位置造出目录+文件，无回滚。
- **影响**：开发者机器上某个消费仓未 clone/改名时，sync 报告显示部分 ok 部分 skip，退出码 0，容易被误读为全部成功；半同步态需人工排查。
- **修复建议**：缺失消费仓在默认模式下应 `process.exitCode = 1`（或提供 `--allow-missing` 显式豁免）；写文件改为"写临时文件 + rename"的两段式原子提交，任一消费仓失败时报告并继续处理其余、最后非零退出。

### P1-2 对比度：ink-faint 达标但贴边；dim 色未声明用途限制

- **位置**：tokens.css:24-33；提交 `a27f18f fix(tokens): raise ink-faint to pass AA`
- **证据**（WCAG 2.x 相对亮度公式实测，背景取本仓 steel 色阶）：

  | 前景 | steel-950 (#06090b) | steel-900 | steel-850 | steel-800 (#141c22) | AA(4.5) |
  |---|---|---|---|---|---|
  | `--ink-faint` #748894 | 5.41 | 5.22 | 4.98 | **4.67** | 全过但 steel-800 仅余 0.17 |
  | `--ink-dim` #8ea2ad | 7.53 | — | 6.93 | — | 过 |
  | `--ink` #e8f0f4 | 17.31 | — | — | — | 过 |
  | `--alert` #ff4a3d | 5.99 | — | — | — | 过 |
  | `--plasma` #b467ff | 6.01 | — | — | — | 过 |
  | `--data-dim` #12626d | **2.85** | — | — | — | **不过** |
  | `--power-dim` #7a5310 | **2.92** | — | — | — | **不过** |

- **影响**：`fix(tokens): raise ink-faint to pass AA` 的声明属实（在全部 4 个深色背景上均 ≥4.5），但余量极小——任何人把 ink-faint 用在比 steel-800 更浅的表面（如未来加 steel-750 或 hover 提亮背景）即破 AA。`--data-dim`/`--power-dim` 在任何 steel 背景上都达不到 4.5，也没有注释声明"仅限大号文字/图形装饰"（WCAG 大字阈值为 3:1，两者连 3:1 都不到，只能作非文字装饰）。
- **修复建议**：在 tokens.css 内为每个不达 AA 正文的语义色加注释注明允许用途（例如 `/* decorative borders only, never body text */`）；考虑在 CI 增加一个对比度断言脚本，把"ink-* 在 steel-950..800 上 ≥4.5"固化为回归门，防止下次调色把 4.67 再压破。

### P2-1 CI 门只做语法检查，注释声称的行为未验证

- **位置**：.github/workflows/ci.yml:17-23
- **证据**：唯一 step 为 `node --check scripts/sync.mjs && node --check scripts/check-tokens.mjs`。注释（17-21 行）声称"this gate only verifies the sync script parses and the --check mode reports consumers as missing (rather than failing the run)"，但实际 CI 只做了 `node --check`（语法解析），**并没有运行** `node scripts/sync.mjs --check`，因此"reports consumers as missing rather than failing"这一行为承诺未被任何自动化验证。实测本地运行 `--check` 在消费仓齐全时退出 0（见第四节）；缺失场景的行为（warn + exit 0）只在源码中成立，无测试。
- **影响**：sync.mjs 的任何回归（如 marker 变更、哈希算法变更）本仓 CI 无法发现；tokens.css 语法错误（`canonicalBlock()` 抛 "no :root block"）也不会被 CI 捕获。
- **修复建议**：CI 至少加三步：`node scripts/sync.mjs --check`（验证缺失消费仓场景不崩）、`node -e "import('./scripts/sync.mjs').then(m=>m.canonicalBlock())"`（验证 tokens.css 可提取）、一个最小漂移夹具（临时目录造一个含旧块的假消费仓，跑 `--css/--scripts` 验证 exit 1）。参数对机制已存在（sync.mjs:84-97），夹具测试成本低。

### P2-2 `--check` 模式的提取逻辑与 `check-tokens.mjs` 的守卫条件不一致

- **位置**：scripts/sync.mjs:118-120 vs scripts/check-tokens.mjs:24
- **证据**：
  - sync.mjs 判定"有标记块"用 `start >= 0 && end > start`；
  - check-tokens.mjs 拒绝条件用 `start < 0 || end < start`——即 `end === start` 或"有 END 无 BEGIN"时守卫放行。`end === start` 对两个不同字符串实际不可能，但"文件含 END 标记但无 BEGIN"时：check-tokens 的 `start < 0` 会拒绝（OK），而 sync.mjs `--check` 走到 fallback 分支 `css.slice(css.indexOf(':root {'), ...)`，若文件连 `:root {` 也没有，`indexOf` 返回 -1，`slice(-1, ...)` 截出尾字符参与哈希（实测提取结果为 `""` 或末尾片段），最终误报 drift 而非给出"缺少 marker"的可操作错误。
  - 另外 `check-tokens.mjs:18` 默认路径为 `../src/styles/tokens.css`，对 model-hub 必须显式传参（model-hub/package.json:26 已正确传参），但 README.md:27 给消费方的挂载示例 `node scripts/check-tokens.mjs`（无参数）只对 ops-console 布局成立。
- **影响**：边缘场景下报错信息误导；README 示例对 model-hub 型布局直接无效（不过 model-hub 实际已用参数规避）。
- **修复建议**：统一两脚本的条件（都用 `end > start` 严格判定）；README 的消费方挂载示例改为带占位参数的完整形式。

### P2-3 哈希归一化未防御 CRLF/混合换行与 trailing newline 差异

- **位置**：scripts/sync.mjs:47-53
- **证据**：`hashBlock` 只按 `\n` 切分、trimEnd、join、trim。若某消费仓编辑器把内嵌块保存为 CRLF（`\r\n`），`split('\n')` 后每行带 `\r`，trimEnd 恰好能去掉 `\r`——这一点是安全的。但嵌入块的提取边界（sync.mjs:118-120、check-tokens.mjs:28）是 `css.slice(start + BEGIN.length, end)`，包含标记行之后的前导 `\n`；若消费仓在标记后多/少一个空行，trim 能吸收，实际安全。真正的脆弱点：`canonicalBlock()`（39-44）用 `css.indexOf('\n}', start)` 找 `:root` 块结束——如果 `tokens.css` 本身保存为 CRLF，`\n}` 不匹配（实际是 `\r\n}`），`end < 0` 直接抛错。本仓 tokens.css 当前是 LF，风险未触发。
- **影响**：Windows 协作者或编辑器自动转 CRLF 会让 sync 直接崩溃，错误信息（`tokens.css has no :root block`）与真实原因不符。
- **修复建议**：`canonicalBlock` 先 `css.replace(/\r\n/g, '\n')` 再提取；或在 CI/仓库加 `.gitattributes`/`.editorconfig` 锁定 LF（当前两者均无）。

### P2-4 同步无版本戳/来源记录，lock 只有裸哈希

- **位置**：tokens.lock（消费仓）、scripts/sync.mjs:124/136
- **证据**：`tokens.lock` 内容为单行 64 位十六进制哈希（实测两消费仓均为 `646cdcaf…c6f8`，与本地重算的 canonical 哈希一致），不含本仓版本号（package.json 0.1.0）、commit、日期。出漂移时 check-tokens.mjs:38-42 的报错只提示 "run the console-ui sync script"，无法从 lock 反推消费仓落后了几个版本。
- **影响**：跨仓排障成本高；README.md:15 说"将来需要按版本号分发时再升级为 git tag 依赖"，说明是已知权衡。
- **修复建议**（可选）：lock 第二行追加同步时本仓的 `git rev-parse --short HEAD` 或 package.json version；报错信息引用该戳。

### P3-1 文档与实现的轻微出入

- **位置**：README.md:20、46-51 vs scripts/sync.mjs
- **证据**：
  - README.md:20 称 `npm run sync` "把 tokens.css 的 :root 块写入所有消费方 + 刷新 lock + 同步校验脚本"——属实（sync.mjs:135-137）。
  - README.md:44-51 "当前消费方"表格与 CONSUMERS 硬编码一致（已核对路径均真实存在）。
  - 出入：README 未提及 `--css/--scripts` 参数对（sync.mjs:80-97 注释说用于 git worktrees）；未提及缺失消费仓时 sync 退出码仍为 0（见 P1-1）。
  - tokens.css 头注释（:5）说 "shared by ops-console, model-hub and the **tier0 landing sites**"，但 CONSUMERS 只有前两者，README.md:6-9 又明确说 console-ui 与 landing-ui "两套变量不交叉"——头注释与 README 边界声明矛盾（未确认 tier0 landing 是否真有消费）。
- **修复建议**：tokens.css 头注释删掉 "tier0 landing sites" 或改为与 README 一致的表述；README 补充 `--css/--scripts` 用法与缺失行为。

### P3-2 `resolveConsumers` 的参数解析依赖顺序且有死代码

- **位置**：scripts/sync.mjs:84-101
- **证据**：`--css` 的值缺失时（`args[i+1]` 为 undefined），第 89-91 行先用 `dirname(css)` 计算 scripts 默认值，到 92 行才抛 `--css requires a path`——`dirname(undefined)` 会先抛 TypeError，真正的错误信息被掩盖（实测 `node scripts/sync.mjs --css` 输出 `TypeError [ERR_INVALID_ARG_TYPE]` 而非自定义信息）。93 行 `scripts ?? scriptDirFor(css)` 中 `scripts` 恒有值（91 行已赋默认），`scriptDirFor` 为死代码。
- **影响**：仅 DX（报错信息不友好），无功能错误。
- **修复建议**：把 `if (!css)` 检查提到计算 scripts 之前；删除死代码。

### P3-3 无 LICENSE、无 .gitignore、无 .editorconfig

- **证据**：仓库根目录仅 6 文件（ls 实测）。虽为 private 内部仓，缺 .gitignore 意味着 `node_modules/`、`*.log` 无防护（当前无依赖，风险低）。
- **修复建议**：加一个最小 `.gitignore`（`node_modules/`、`*.log`、`.DS_Store`）与 `.editorconfig`（LF + utf-8，配合 P2-3）。

## 四、验证门实际执行结果

以下命令均在 macOS（本机沙箱）执行，全部只读：

| # | 命令 | 退出码 | 关键输出 |
|---|---|---|---|
| 1 | `node scripts/sync.mjs --check`（console-ui 根目录） | 0 | `ok: …/ops-console/src/styles/tokens.css` / `ok: …/model-hub/apps/hub/web/src/styles/tokens.css` |
| 2 | `npm run check` | 0 | 同 #1（即 `sync.mjs --check`） |
| 3 | `node --check scripts/sync.mjs && node --check scripts/check-tokens.mjs` | 0 | 无输出（语法合法） |
| 4 | `node -e "import('./scripts/sync.mjs').then(m=>console.log(m.hashBlock(m.canonicalBlock())))"` | 0 | `646cdcaf12e76322397f929b8ae4d9f35958529cfa97803747d9cf62e237c6f8` |
| 5 | `cat` 两消费仓 tokens.lock | 0 | 均为 `646cdcaf…c6f8`，与 #4 完全一致 |
| 6 | `diff` 本仓与两消费仓的 check-tokens.mjs | 0 | 无差异（字节一致） |
| 7 | `grep` 消费仓 tokens.css 标记 | 0 | 两仓均含 begin/end 标记，块位于第 2-33 行 |
| 8 | `grep check:tokens` 消费仓 package.json / ci.yml | 0 | ops-console/package.json:21、model-hub/package.json:26（带显式路径参数）；两仓 ci.yml 均有 `Design tokens in sync` step（ops ci.yml:24-25、model-hub ci.yml:30-31） |
| 9 | WCAG 对比度计算（自写脚本，标准相对亮度公式） | 0 | 结果表见 P1-2 |

**未真实执行** `npm run sync`（写模式），因为本任务严禁改写下游仓文件。

**漂移对比结论**：两个消费仓的内嵌块哈希与 canonical 哈希一致，checker 脚本字节一致——**无漂移**。

**受阻项**：无。所有命令均在沙箱内一次通过，未触发权限拒绝。

## 五、修复优先级建议

1. **先修 P1-1**（同步原子性 + 缺失消费仓退出码）：这是"权威源"仓的核心承诺，当前实现对脚本化调用者不可信。改动集中在 sync.mjs 的 main()，约 15 行。
2. **再修 P1-2 的文档面**：给 tokens.css 的 dim 色加用途注释（一行注释的成本，避免下游误用产生无障碍违规）；把"ink-faint ≥ 4.5 on steel-950..800"做成 CI 断言脚本，防止回归。
3. **P2-1 CI 增强**：加 `--check` 缺失场景实测 + 漂移夹具测试（用已有的 `--css/--scripts` 参数，无需新机制）。
4. **P2-2 / P3-2 顺手修**：统一 marker 判定条件、修复 `--css` 参数校验顺序、更新 README 示例。
5. **P2-3 / P3-3 防御性**：`.editorconfig` + CRLF 归一化 + `.gitignore`。
6. **P2-4 / P3-1** 可延后：lock 版本戳属增强，README/头注释矛盾属表述问题。

总体评价：仓库小而聚焦，机制设计（哈希锁定 + checker 复制 + 消费仓 CI 门）自洽且已在两个消费仓实际生效；令牌值本身合法、AA 修复属实。主要风险集中在同步操作的健壮性（非原子、静默跳过）与验证门的薄弱（本仓 CI 近乎空转），均为可低成本修复的工程化问题，无安全与数据损坏级缺陷。
