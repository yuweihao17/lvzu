# 小米手环应用商店

这是自托管的小米手环应用目录、激活中心和管理员后台。生产环境使用 Node.js 与 PostgreSQL，不再依赖 Vercel 或 Supabase 的运行时服务。

## 运行方式

```bash
npm ci
DATABASE_URL='postgresql://...' \
ADMIN_SECRET='管理员密钥' \
ACTIVATION_SALT='与已发布手环应用一致的盐值' \
npm start
```

生产部署请使用 `docker-compose.yml`。服务只绑定到 `127.0.0.1:3100`，再由 Nginx 提供 HTTPS 和域名入口；不要将容器端口直接暴露到公网。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `POSTGRES_PASSWORD` | Docker 内 PostgreSQL 密码 |
| `DATABASE_URL` | Node 服务连接 PostgreSQL 的地址 |
| `ADMIN_SECRET` | 管理中心验证密钥 |
| `ACTIVATION_SALT` | 激活码计算盐，必须与已发布的手环应用保持不变 |
| `PORT` | 服务端口，默认 `3100` |

生产环境缺少 `ACTIVATION_SALT` 时，激活请求会拒绝执行，避免意外生成与旧版手环不兼容的激活码。

## 数据迁移

旧 Supabase 数据仅作为一次性导入源，不参与新站运行。先用只读凭据运行预检，再正式导入两个源项目：

```bash
IMPORT_DRY_RUN=1 SOURCE_PROJECT='旧项目 ID' SOURCE_DATABASE_URL='postgresql://...' TARGET_DATABASE_URL='postgresql://...' node scripts/import-supabase.js
SOURCE_PROJECT='旧项目 ID' SOURCE_DATABASE_URL='postgresql://...' TARGET_DATABASE_URL='postgresql://...' node scripts/import-supabase.js
```

导入脚本会保存所有 `public` 表原始行到 `legacy_rows`，并仅映射已确认的业务表。整个正式导入在单个事务中执行，失败会回滚本次映射和归档写入。详情见 [MIGRATION.md](MIGRATION.md)。

## 切换原则

- 先导入两个旧库并核验行数，再切换 Nginx/DNS。
- 切换后至少保留旧 Vercel 与 Supabase 7 天，确保已发布手环应用仍能找回激活码。
- 不要将数据库直连串、管理员密钥或激活盐提交到 Git。
