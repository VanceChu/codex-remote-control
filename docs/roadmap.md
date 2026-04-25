# Codex Remote Control MVP Roadmap

## Summary

新增 `docs/roadmap.md`，作为后续开发主路线图。文档使用 Markdown checklist：已完成项标记 `- [x]`，未完成项标记 `- [ ]`，并给已完成项加状态限定：`已测`、`已接线`、`仅 scaffold`、`数据结构已完成但未接线`。

路线覆盖完整 MVP：扫码连接、Noise/E2EE、Codex App Server 控制、stream、approval、interrupt、重连、Web Push、workers.dev real smoke。

## Roadmap Milestones

### 0. 已完成基座

- [x] `已测` 初始化 npm workspaces monorepo：TypeScript、Vitest、ESLint、Prettier、Wrangler、Vite PWA。
- [x] `已测` 创建 public GitHub repo，并合并 review hardening PR。
- [x] `已测` 生成并固定 `codex-cli 0.124.0` App Server schema。
- [x] `已测` 稳定 schema 生成顺序，避免 repeated codegen 随机 diff。
- [x] `已测` `packages/protocol`：RFC 8785 canonical JSON、Ed25519 signing、XChaCha20-Poly1305、AAD、pairing proof、atomic sequence reservation、ring buffer、idempotency cache。
- [x] `已测` `packages/codex-client`：JSON-RPC peer、notification/error handling、slash method whitelist、unsupported request matrix。
- [x] `已接线` `apps/bridge`：`doctor/pair/start` CLI 已存在；Phase 2 已接入 relay pairing 和 ping/pong WebSocket runtime。
- [x] `已测` `apps/bridge`：approval state、device registry、file-backed atomic sequence store。
- [x] `数据结构已完成但未接线` `apps/relay`：DO room state、bridge lock、per-device buffer accounting、rate limit model。
- [x] `已接线` `apps/relay`：hibernatable WS entrypoint 和 provisional fail-closed auth 已有；Phase 2 已接入 bridge/client first-frame auth、presence 和 ping/pong 路由。
- [x] `已接线` `apps/pwa`：unpaired screen、pair claim、workspace shell 和 ping/pong UI。
- [x] `已测` `apps/pwa`：IndexedDB sequence store；这只覆盖 sequence reservation，不代表业务状态持久化。

### 1. Crypto Spike 和最小部署基线

先做这一步，再实现持久 pairing，避免 Noise 失败后返工。

- [x] `已测` Node bridge、Cloudflare Worker、PWA 浏览器三端跑同一组 Noise IK KAT。
- [x] `已测` 优先验证 `noise-protocol`；若不兼容，改用 `@noble/*` 薄封装。
- [x] `已测` 确定 handshake wire format、key export label、control-plane message format。
- [x] `已测` 更新 `docs/crypto.md`，记录最终 Noise 选型和 KAT。
- [x] `已测` 补最小 workers.dev 部署：`/health`、static PWA、DO binding、provisional WS secret。
- [x] `已测` 新增 `crc relay doctor`：检查 wrangler login、DO binding、Worker URL、required secrets。
- [x] `已测` Acceptance：三端 KAT 通过；`/health` 逻辑可访问；relay WS 能 fail-closed。真实 workers.dev smoke 留到阶段 8。

### 2. 手机扫码连接 Demo

目标是先跑通 `phone -> relay -> bridge -> relay -> phone`，暂不接 Codex，不保存任何会和 Noise 冲突的 payload key 字段。

- [x] `已测` Relay `POST /api/pair/create`：bridge 创建一次性 code，TTL 5 分钟，失败限速。
- [x] `已测` Relay `POST /api/pair/claim`：PWA 提交 `roomId + code + deviceId`，返回临时 WS 认证凭据/device token。
- [x] `已测` 明确阶段 2 的 device token 只做 relay WS 准入，不承担 payload 加密/签名职责。
- [x] `已测` Relay `/ws/bridge`：bridge 注册 room online。
- [x] `已测` Relay `/ws/client`：client 第一帧 `client.auth`；认证前拒绝业务消息。
- [x] `已测` Relay DO 维护 bridge/client presence，并广播 `presence.update`。
- [x] `已测` Bridge `crc bridge start --relay <url>`：真实连接 `/ws/bridge`，打印 online/device connected/ping logs。
- [x] `已测` Bridge `crc bridge pair <relay-url>`：调用 pair create，打印 URL 和终端二维码。
- [x] `已测` PWA 扫码后 pair claim，保存 paired state，连接 `/ws/client`。
- [x] `已测` PWA 显示 room、bridge online/offline、device id，并提供 `Send ping`。
- [x] `已测` Acceptance：本地 pairing URL claim 后显示 `Bridge online`；点击 ping 后 bridge 终端收到 ping，PWA 收到 pong。真实手机 workers.dev smoke 留到阶段 8。

### 3. E2EE Pairing 和 Payload Keys

device token 继续作为 relay WS 准入；Noise 只负责 control-plane；payload keys 负责业务加密、签名、replay protection。

- [ ] Bridge/device 生成并持久化 X25519 Noise static key 和 Ed25519 signing key。
- [ ] Pairing proof 绑定 `roomId + bridgeNoisePub + bridgeSignPub + deviceNoisePub + deviceSignPub + nonceB + nonceD + keyId + epoch`。
- [ ] Bridge 通过 Noise channel 下发 per-device `uplinkKey/downlinkKey + noncePrefix`。
- [ ] PWA 用 IndexedDB 保存 key material；raw key 用 non-extractable WebCrypto KEK 包裹。
- [ ] Business payload 先 Ed25519 签名，再 XChaCha20-Poly1305 加密。
- [ ] Relay 只路由 opaque payload，不能解密 prompt、命令、diff、approval。
- [ ] Acceptance：篡改 AAD/ciphertext/signature 都失败；relay 日志不含敏感正文。

### 4. Codex App Server Read Path

- [ ] Bridge `start` 启动并监督 `codex app-server --listen stdio://`。
- [ ] Bridge 内部执行 `initialize`；PWA 不可直接调用。
- [ ] Bridge 实现白名单：`thread/list`、`thread/read`、`thread/turns/list`、`thread/start`、`thread/resume`。
- [ ] Bridge 启动时做 schema drift 检查：白名单方法签名没变则 warn，签名变更则拒启。
- [ ] README 增加 schema 升级 SOP：升级 Codex、运行 `generate:codex-schema`、检查 manifest/diff、更新测试。
- [ ] PWA 增加 thread list、thread detail、refresh/error/loading 状态。
- [ ] Acceptance：手机可列出真实 Codex threads，并打开 thread 内容。

### 5. Turn Start 和 Stream Timeline

- [ ] PWA composer 发 `turn.start`，带 `threadId + prompt + idempotencyKey`。
- [ ] Bridge 对 `threadId + idempotencyKey` 保留 10 分钟 terminal result。
- [ ] Bridge 处理 Codex notifications：`turn/started`、`item/*`、`turn/diff/updated`、`turn/completed`、error。
- [ ] Bridge coalesce token-level stream delta，再发 encrypted timeline item。
- [ ] PWA 渲染 agent text、reasoning summary、tool item、terminal event、diff summary。
- [ ] Acceptance：手机发只读 prompt，能看到 turn started、流式输出、turn completed。

### 6. Approval 和 Interrupt

- [ ] Supported approval 只包括 `item/commandExecution/requestApproval` 和 `item/fileChange/requestApproval`。
- [ ] Legacy `applyPatchApproval`、`execCommandApproval` 继续按 `docs/crypto.md` fail-closed，不走人工审批 UI。
- [ ] `item/permissions/requestApproval`、`item/tool/requestUserInput`、`mcpServer/elicitation/request` 继续按 unsupported matrix 处理。
- [ ] Bridge 是唯一 approval 仲裁者；first valid response wins。
- [ ] PWA approval modal 显示命令/文件变更摘要，支持 allow/deny。
- [ ] Approval watchdog 默认 5 分钟超时，超时保守 deny/error 解挂。
- [ ] PWA 支持 `turn.interrupt`。
- [ ] Acceptance：真实 command/file approval 可在手机允许/拒绝；interrupt 可中断 running turn；unsupported requests 不会卡死 app-server。

### 7. Reconnect、Push、Device 管理

- [ ] Relay per-device encrypted ring buffer 支持 `lastSeq` delta 补发。
- [ ] PWA 断线重连后恢复 bridge status、thread state、recent timeline。
- [ ] Key epoch rotate 触发条件：device revoke、nonce reuse uncertainty、manual rotate。
- [ ] Epoch rotate 后 bridge re-emit encrypted thread snapshot。
- [ ] Web Push 只推 `approval_waiting`、`turn_completed`、`turn_failed`，payload 不含敏感正文。
- [ ] iOS PWA 文档：必须 Add to Home Screen；说明 Safari Web Push 权限、后台、Focus/Low Power 限制。
- [ ] CLI：`crc devices list`、`crc devices revoke <id>`。
- [ ] CLI：`crc relay reset --break-glass`，破坏性清空 room，用于无 trusted device 恢复。
- [ ] Relay revoke 后立即 kick active socket，bridge 删除 device payload keys。
- [ ] Acceptance：断网重连不重复提交 prompt；撤销设备无法再连；push payload 不泄露命令正文。

### 8. Deployment、Quota 和 Real Smoke

- [ ] `wrangler.toml` 补 Worker static assets / PWA hosting 配置。
- [ ] README 增加 workers.dev 部署步骤、自有域名建议、Cloudflare Free 限制。
- [ ] 量化单日/单 turn 的 DO requests、storage bytes、CPU/wall time，对照 Free 限额。
- [ ] Real smoke：workers.dev 上手机扫码配对并 ping/pong。
- [ ] Real smoke：手机列真实 Codex threads。
- [ ] Real smoke：手机发只读 prompt 并看 completed。
- [ ] Real smoke：触发 command approval，手机 allow/deny。
- [ ] Real smoke：interrupt、bridge restart、手机断网重连。
- [ ] Real smoke：device revoke 和 break-glass reset。
- [ ] Acceptance：上述 smoke 全部通过，才算 MVP 可用。

## Public Interfaces To Document

- HTTP:
  - `POST /api/pair/create`
  - `POST /api/pair/claim`
  - `POST /api/push/subscribe`
- WS:
  - `GET /ws/bridge`
  - `GET /ws/client`
- Product messages:
  - `bridge.hello`
  - `client.auth`
  - `presence.update`
  - `thread.list/read/start/resume`
  - `turn.start/interrupt`
  - `approval.request/respond/resolved`
  - `timeline.item`
  - `turn.completed/failed`
- CLI:
  - `crc bridge doctor`
  - `crc bridge start --relay <url>`
  - `crc bridge pair <relay-url>`
  - `crc devices list`
  - `crc devices revoke <id>`
  - `crc relay doctor`
  - `crc relay reset --break-glass`

## Test Plan To Include

- Unit:
  - pairing TTL/reuse/rate-limit
  - token hash verification
  - WS first-frame auth
  - Noise IK KAT
  - AEAD tamper failure
  - approval first-writer-wins
  - approval timeout watchdog
  - idempotency duplicate terminal result
- Integration:
  - bridge/client WS routing in relay DO
  - DO hibernation wake state restore
  - mock Codex app-server thread/list and turn/start
  - command/file approval mapping
  - unsupported server request matrix
  - key epoch rotate + snapshot re-emit
  - app-server crash restart behavior
- PWA E2E:
  - unpaired screen
  - scan/paste pairing URL
  - pair claim success/failure
  - workspace connected/offline states
  - prompt submit
  - approval allow/deny
  - reconnect with `lastSeq`
- Real smoke:
  - workers.dev deploy
  - phone pairing
  - real `codex-cli 0.124.0`
  - read-only task
  - command approval
  - interrupt
  - bridge restart
  - device revoke
  - break-glass reset

## Assumptions And Defaults

- 文档输出路径固定为 `docs/roadmap.md`。
- Roadmap 范围固定为完整 MVP，不扩展到团队、多电脑、接管已有 TUI 会话。
- 下一开发分支建议为 `feat/e2ee-payload-keys`，从阶段 3 的 Noise pairing 和 payload key issue 开始。
- 阶段 2 的 provisional token 只做 relay admission；阶段 3 后 payload confidentiality/integrity 由 Noise-issued payload keys 和 signed encrypted envelopes 保证。
- Codex CLI 目标版本继续固定为 `codex-cli 0.124.0`。
