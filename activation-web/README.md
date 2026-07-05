# 吕祖灵签 Vercel 激活中心

这个目录可以作为独立 Vercel 项目部署。

## 当前边界

本目录只作为“吕祖灵签 / 小米手环项目”的激活中心维护。

## 部署结构

- `index.html`：用户激活页和管理员中心。
- `api/activate.js`：用户输入卡密和设备码，首次生成激活码。
- `api/recover.js`：已激活设备只输入设备码，找回已有激活码。
- `api/admin/*`：管理员生成卡密、导入卡密、查询、解绑。
- `api/afdian/webhook.js`：爱发电 Webhook。
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

安全说明：

- 管理员密码只在当前网页输入框中临时使用，网页不会把 `ADMIN_SECRET` 保存到 `localStorage`。
- `ADMIN_SECRET` 必须只配置在 Vercel 环境变量中，不要写入 Git 仓库。

## 域名

本项目推荐绑定：

```text
act.lvzuqian.top
```

在 Vercel 项目 Domains 里添加 `act.lvzuqian.top`，然后到腾讯云 DNSPod 添加 Vercel 要求的 CNAME。

注意：该域名只服务吕祖灵签小米手环项目。

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
