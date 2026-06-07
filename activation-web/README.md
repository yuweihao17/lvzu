# 吕祖灵签 Vercel 激活中心

这个目录可以作为独立 Vercel 项目部署。

## 部署结构

- `index.html`：用户激活页和管理员中心。
- `api/activate.js`：用户输入卡密和设备码，首次生成激活码。
- `api/recover.js`：已激活设备只输入设备码，找回已有激活码。
- `api/admin/*`：管理员生成卡密、导入卡密、查询、解绑。
- `api/afdian/webhook.js`：爱发电 Webhook。
- `the-wow.html`：the_wow 桌面软件卡密兑换、激活码查询、管理员生成卡密、查询旧卡密和人工升级。
- `api/the-wow.js`：the_wow 单一接口，按 `action` 分发兑换、查询、扣次数、生成卡密、人工升级和管理员查询。
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

## the_wow 授权逻辑

the_wow 与手环应用共用同一个 Vercel 项目、同一个域名和同一个 Supabase 项目，但使用独立表：

```text
wow_cards
wow_licenses
wow_license_entitlements
wow_redemptions
wow_consumptions
```

销售平台自动发的是“兑换卡密”。当前推荐两条运营路径：

1. 平台自动发货：用户在淘宝、拼多多、闲鱼购买后收到新卡密；如果是首次购买，直接在客户端输入卡密激活；如果是再次购买，先在客户端设置里重置卡密，再输入新卡密重新激活对应套餐。
2. 人工升级/加次数：用户联系管理员微信付款，并告知第一次激活用的旧卡密；管理员打开 `https://act.lvzuqian.top/the-wow.html`，用“查询用户旧卡密”确认权益，再用“按已有卡密升级/加次数”追加 SKU。用户重启 APP 后，客户端会通过远程 `status` 自动刷新权益。

用户不需要理解数据库里的 entitlement 账本；用户只需要保存自己的卡密。

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
生成平台卡密：the-wow.html -> 管理员生成卡密 -> 复制到平台自动发货卡密池
查询用户权益：the-wow.html -> 查询用户旧卡密
人工升级/加次数：the-wow.html -> 按已有卡密升级/加次数
```

## 域名

推荐绑定：

```text
act.lvzuqian.top
```

在 Vercel 项目 Domains 里添加 `act.lvzuqian.top`，然后到腾讯云 DNSPod 添加 Vercel 要求的 CNAME。

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
