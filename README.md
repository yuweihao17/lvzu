# 吕祖灵签 · 小米手环 10 快应用

抽签类手环应用：净身、静心、陈述所问，摇签后得到第 1–100 签的签文与解签。
离线可用；激活（卡密 / 3 次试用）只约束「求签」这一步。

- 包名：`com.application.watch.lvzu`；仓库：`yuweihao17/lvzu`（private）
- 关联项目：网页端（商店 + 激活中心）→ `D:/Projects/XIAOMIapp/BAZIQIMEN/activation-web`
  （仓库 `yuweihao17/xiaomi-app-store`），激活系统与部署唯一文档在那边。

## 快速开始

```bash
npm install
npm run start     # 修复手环10模拟器镜像别名并启动 aiot --watch
npm run build     # 生成 build/ 与 dist/*.debug.rpk
npm run release   # 签名发布（需要 sign/ 下的证书，已被 git 忽略）
npm run lint      # eslint src/common/*.js scripts/*.js
```

Node 18+。`scripts/start-vela.js` 会把 `~/.vela/sdk/tools/adb/win` 加进 PATH，并修正
`~/.vela/vvd/xiaomi_band_10.ini` 的镜像路径，然后拉起 `aiot start --watch`。

## 目录

```text
src/manifest.json        包名、版本、features、权限、路由（aiot 只读这个）
src/app.ux               应用生命周期（保持屏幕常亮）
src/pages/index/index.ux 主流程：须知→净身→静心→陈述→求签→感应→结果，以及激活页
src/pages/detail/detail.ux 签详情：解签 / 解诗 / 解曰
src/common/activation.js 设备码、激活码、扫码 URL（与网页端算法一致）
src/common/signs.js      100 签完整数据（由脚本生成）
src/common/signPayloads.js  详情页按需取用的长文本
src/common/signSummaries.js 首页用的一页摘要
src/common/*.png         11 张界面素材
scripts/parse-signs.js   从 吕祖灵签全集.md 解析生成 signs.js
吕祖灵签全集.md          签文原始语料（内容源头，别手改生成物）
```

## 数据链路

```text
吕祖灵签全集.md ──> scripts/parse-signs.js ──> src/common/signs.js ──> signPayloads / signSummaries
```

改签文：改 `吕祖灵签全集.md`，重跑 `node scripts/parse-signs.js`，再 build。

## 激活接入

- 手环展示 8 位设备码与二维码：`https://act.lvzuqian.top:7443/index.html?product=lvzu_lingqian&device=<码>`。
- 用户扫码在网页端输入卡密 → 拿到 8 位激活码 → 手环输入 → **本地**用内置盐校验，
  与网页端算法逐字节一致（`lib/activation-code.js`）。
- 盐：`ACTIVATION_SALT = "lvzu-lingqian-change-before-release"`，本应用**不用**专属盐，
  走服务器全局盐（保证已发布手环不变）。改盐必须两端同步并重建 RPK。
- 试用码 `367017` 给 3 次抽签；`hasAccess()` / `consumeTrialOnce()` 在 `index.ux`。
- 存储键：`lvzu_activated` / `lvzu_device_code` / `lvzu_trial_used` / `lvzu_trial_remain`。

细节（算法、卡密模型、部署、密钥轮换、故障排查）见 `activation-web/README.md`。