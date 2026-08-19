# 数据迁移与切换

目标是将两个 Supabase 项目的 `public` 表导入自托管 PostgreSQL，同时保留每条源记录的完整 JSON 备份。

## 切换前必须完成

1. 从两个 Supabase 项目分别获取数据库直连串，不能只使用 Project URL 或 anon key。
2. 使用只读账号或临时导出账号运行导入程序。该账号至少需要读取 `public` schema；若要迁移登录体系，还需要受控导出 `auth.users`。
3. 在新服务器创建独立的 `/opt/xiaomi-app-store` 目录和 `.env`，其中 `ACTIVATION_SALT` 必须与已发布的手环应用一致，`ADMIN_SECRET` 必须与当前管理员密钥兼容。
4. 两个源项目都跑完导入，保存每次输出的表行数报告。报告与源表行数不一致时，不切换 DNS。

## 先运行预检

`IMPORT_DRY_RUN=1` 只读取源库并报告每张表的行数，不会向目标库写入任何数据。两个项目的预检报告都应保存下来，并与 Supabase Dashboard 中的表行数核对。

```bash
IMPORT_DRY_RUN=1 \
SOURCE_PROJECT=trmfqisrqbpbsksldkwc \
SOURCE_DATABASE_URL='postgresql://...' \
TARGET_DATABASE_URL='postgresql://...' \
node scripts/import-supabase.js
```

## 正式导入命令

在新服务已启动、目标数据库可连接后，对每个源项目单独运行：

```bash
SOURCE_PROJECT=trmfqisrqbpbsksldkwc \
SOURCE_DATABASE_URL='postgresql://...' \
TARGET_DATABASE_URL='postgresql://...' \
node scripts/import-supabase.js
```

第二个项目替换为 `pvojzpcigrylcqsdhrwj` 与它自己的直连串。

如果数据库密码不可查看，可以使用 Supabase Personal Access Token 通过管理 API 创建只读快照，再从快照导入：

```bash
SUPABASE_ACCESS_TOKEN='sbp_...' \
SOURCE_PROJECT=trmfqisrqbpbsksldkwc \
SOURCE_EXPORT_FILE='/secure-temp/trmfqisrqbpbsksldkwc.json' \
node scripts/export-supabase-api.js

SOURCE_PROJECT=trmfqisrqbpbsksldkwc \
SOURCE_EXPORT_FILE='/secure-temp/trmfqisrqbpbsksldkwc.json' \
TARGET_DATABASE_URL='postgresql://...' \
node scripts/import-supabase.js
```

快照包含源业务表的完整数据，只能保存在受控临时目录；导入和核验完成后必须删除，不得提交到 Git。

导入器会：

- 将每个 `public` 表的每一行写入 `legacy_rows`；重复运行按来源表和源行 ID 覆盖，不会重复增加备份记录。
- 把 `profiles` 映射到统一 `app_users`，保留源项目与源用户 ID。
- 把 `lvzu_cards`、`lvzu_afdian_orders`、`lvzu_activations` 映射到统一产品、订单、卡密和激活表。
- 将 TheWow 的 `orders` 留在隐藏的 `thewow_legacy` 产品下，其他业务表保留在 `legacy_rows`，避免错误地把不同业务的权益、礼品码或用量记录当作手环卡密。
- 在单个目标数据库事务中完成归档与映射；任何一条源记录无法导入时，本次导入会整体回滚。
- 遇到目标库中未定义的产品 ID 时，只归档原始数据，不会擅自将卡密或激活记录归入吕祖灵签。

## 不能自动迁移的内容

Supabase Auth 的密码哈希、邮件确认状态和 refresh token 不应通过公开 API 迁移。只有在取得数据库管理员级导出权限后，才能用受控 SQL 导出 `auth.users` 并制订用户登录迁移方案。现阶段所有公开业务数据仍会保留在 `legacy_rows`，但不应删除任一 Supabase 项目。

## 回滚

在 Nginx/DNS 改到新服务后的 7 天内保留 Vercel 域名和两个 Supabase 项目。发现激活异常时，将 Nginx 上游切回旧站即可；新 PostgreSQL 数据卷不删除。
