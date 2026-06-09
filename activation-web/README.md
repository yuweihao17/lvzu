# 吕祖灵签 Vercel 激活中心

这个目录可以作为独立 Vercel 项目部署。

## 当前边界

本目录只作为“吕祖灵签 / 小米手环项目”的激活中心继续维护。

TheWow 已决定迁出本项目，不再与手环应用共用域名、Vercel 项目或 Supabase 数据库。历史上新增的 `the-wow.html`、`api/the-wow.js` 和相关表结构只作为迁移前参考，后续不应继续在本目录开发 TheWow 新功能。

TheWow 新方向见桌面端仓库文档：

```text
D:\interview\docs\thewow-account-commerce-architecture.md
```

## 部署结构

- `index.html`：用户激活页和管理员中心。
- `api/activate.js`：用户输入卡密和设备码，首次生成激活码。
- `api/recover.js`：已激活设备只输入设备码，找回已有激活码。
- `api/admin/*`：管理员生成卡密、导入卡密、查询、解绑。
- `api/afdian/webhook.js`：爱发电 Webhook。
- `the-wow.html`：历史 TheWow 兑换页，待迁移到 TheWow 独立项目后移除。
- `api/the-wow.js`：历史 TheWow 接口，待迁移到 TheWow 独立项目后移除。
- 数据库：Supabase Postgres，表结构请先在 Supabase SQL Editor 执行 `schema.sql`。

## Vercel 环境变量

在 Vercel 项目 Settings -> Environment Variables 填：

```text
ADMIN_SECRET=你的管理员密码
AFDIAN_USER_ID=1b9cd46856a311f1b71e52540025c377
AFDIAN_API_TOKEN=你的爱发电 API Token，可先留空
DEFAULT_PRODUCT_ID=lvzu_lingqian
ACTIVATION_SALT=必须和手环端 src/common/activation.js 一致
LVZU_LINGQIAN_SALT=必须和手环端 src/common/activation.js 一致
```

请另外设置：

```text
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的 service_role 密钥
```

## TheWow 历史授权逻辑（已废弃）

以下内容仅用于理解旧实现和迁移数据，不再作为新开发依据。

旧方案中，TheWow 与手环应用共用同一个 Vercel 项目、同一个域名和同一个 Supabase 项目，但使用独立表：

```text
wow_cards
wow_licenses
wow_license_entitlements
wow_redemptions
wow_consumptions
```

旧销售平台自动发的是“兑换卡密”。这套路径后续要迁移为 TheWow 独立网站里的“礼品码兑换”：

1. 平台自动发货：用户收到礼品码后，登录 TheWow 独立网站，在用户中心兑换到自己的账号。
2. 人工升级/加次数：管理员在 TheWow 独立后台按账号、用户 ID、邮箱、手机号或历史礼品码追加权益。

新方案中，用户账号是身份，礼品码只兑换权益；用户不再靠保存卡密作为长期身份。

SKU 规则：

```text
standard_1 到 standard_10，standard_perm
ultra_1 到 ultra_10，ultra_perm
max_1 到 max_10，max_perm
```

权限规则：

```text
standard < ultra < max
```

扣次数时会优先扣满足功能要求的最低等级权益：标准功能优先扣 standard，再扣 ultra/max；Ultra 功能只扣 ultra/max；Max 功能只扣 max。永久版对应等级及以下功能不扣次数。

管理员常用动作：

```text
历史生成平台卡密：the-wow.html -> 管理员生成卡密 -> 复制到平台自动发货卡密池
历史查询用户权益：the-wow.html -> 查询用户旧卡密
历史人工升级/加次数：the-wow.html -> 按已有卡密升级/加次数
```

安全说明：

- 管理员密码只在当前网页输入框中临时使用，网页不会把 `ADMIN_SECRET` 保存到 `localStorage`。
- `ADMIN_SECRET` 必须只配置在 Vercel 环境变量中，不要写入 Git 仓库。
- TheWow 新销售口径不应继续引用本目录。应迁移到 TheWow 独立官网、账号系统、礼品码兑换和用户中心。

## 域名

本项目推荐绑定：

```text
act.lvzuqian.top
```

在 Vercel 项目 Domains 里添加 `act.lvzuqian.top`，然后到腾讯云 DNSPod 添加 Vercel 要求的 CNAME。

注意：该域名只继续服务小米手环项目。TheWow 应购买新域名并绑定独立 Vercel 项目。

手环端二维码地址在：

```text
src/common/activation.js
```

当前已改为：

```text
https://act.lvzuqian.top/index.html
```

## 老用户迁移

老用户能否找回激活码，取决于历史卡密数据是否已导入 Supabase。

最关键的数据是：

```text
lvzu_cards
lvzu_afdian_orders
```

需要保留这些字段：

```text
product_id
card_code
status
bound_device_code
activation_code
activated_at
created_at
updated_at
order_no
```

旧版 RPK 的二维码如果还指向旧地址，已经安装旧版的用户不会自动切到新网页。建议统一发布新 RPK，并保留旧版一段过渡期。
