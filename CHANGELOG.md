# 变更日志

## 2026-06-10 修复 Ghostty 跨桌面跳转把窗口拉到当前桌面
- 点击会话列表跳转时，若目标终端位于另一桌面某窗口的「未选中标签页」，原先会把整个窗口拉到当前桌面，而非把用户切换过去
- 根因：Ghostty AppleScript `focus` 用 `makeKeyAndOrderFront`，对屏外（未选中标签）的 NSWindow 上屏会将其吸附到当前 Space；`select tab` 同理
- 修法（踏板法）：先用只读 probe 判断目标标签是否选中——已选中则直接 focus；未选中则先 focus 该窗口当前选中标签的终端（唯一验证可靠切换 Space 的操作），待切换完成再 focus 目标，标签切换发生在已激活的 Space 内，不再拉窗
- `src/focus.js` 新增 `buildGhosttyIdProbeScript` / `buildGhosttyCwdProbeScript` 与 `runWithSteppingStone` 编排；`focus` 脚本还原为原版扁平查询
- 性能：via 路径原先叠加两段固定等待（踏板后 450ms + `runGhosttyScript` 自带 400ms 共 850ms），现改为踏板后直接 focus 目标、仅等单次 `GHOSTTY_STEP_SETTLE_MS`（300ms），跨桌面跳转延迟由 ~1.5s 降至 ~1.1s；direct/miss 路径保持原版行为与 fallback 链不变；并在 debug 日志埋入各段耗时戳
- 新增 `test/focus-ghostty-space.test.js`；Ghostty 1.3.1 / macOS 26 真机验证通过
