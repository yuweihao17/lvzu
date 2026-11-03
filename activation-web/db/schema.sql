create extension if not exists pgcrypto;

create table if not exists app_products (
  id text primary key,
  name text not null,
  category text not null default '其他',
  description text not null default '',
  purchase_url text not null default '',
  price_label text not null default '',
  prefix text not null default 'APP',
  accent text not null default 'blue',
  status text not null default 'available' check (status in ('available','coming_soon','hidden')),
  sort_order integer not null default 100,
  activation_salt text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_products add column if not exists activation_salt text not null default '';

create table if not exists product_plans (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references app_products(id) on delete cascade,
  name text not null,
  prefix text not null default 'APP',
  duration_days integer not null default 0 check (duration_days >= 0),
  max_devices integer not null default 1 check (max_devices > 0),
  max_activations integer not null default 1 check (max_activations > 0),
  activation_algorithm_version integer not null default 1,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name)
);

create table if not exists card_batches (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references product_plans(id),
  batch_name text not null,
  quantity integer not null default 0 check (quantity >= 0),
  source text not null default 'generated',
  expires_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  source_project text not null default 'local',
  source_user_id text,
  email text,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_project, source_user_id)
);

create table if not exists app_orders (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references app_products(id),
  user_id uuid references app_users(id),
  provider text not null default 'manual',
  external_order_no text,
  card_code text,
  amount_cents integer,
  currency text not null default 'CNY',
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_order_no)
);

create table if not exists app_cards (
  id bigserial primary key,
  product_id text not null references app_products(id),
  plan_id uuid references product_plans(id),
  batch_id uuid references card_batches(id),
  card_code text not null unique,
  status text not null default 'new' check (status in ('new','reserved','used','expired','revoked','disabled')),
  bound_device_code text not null default '',
  activation_code text not null default '',
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_cards add column if not exists plan_id uuid references product_plans(id);
alter table app_cards add column if not exists batch_id uuid references card_batches(id);
alter table app_cards add column if not exists expires_at timestamptz;
alter table app_cards drop constraint if exists app_cards_status_check;
alter table app_cards add constraint app_cards_status_check check (status in ('new','reserved','used','expired','revoked','disabled'));

create table if not exists app_activations (
  id bigserial primary key,
  product_id text not null references app_products(id),
  card_id bigint references app_cards(id),
  card_code text not null,
  device_code text not null,
  activation_code text not null,
  created_at timestamptz not null default now(),
  unique (product_id, device_code)
);

create table if not exists legacy_rows (
  id bigserial primary key,
  source_project text not null,
  source_table text not null,
  source_row_id text,
  row_data jsonb not null,
  imported_at timestamptz not null default now(),
  unique (source_project, source_table, source_row_id)
);

create table if not exists admin_credentials (
  id smallint primary key default 1 check (id = 1),
  secret_hash text not null,
  secret_version integer not null default 1,
  rotated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  secret_version integer not null,
  ip_address text not null default '',
  user_agent text not null default '',
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists admin_audit_logs (
  id bigserial primary key,
  action text not null,
  target_type text not null default '',
  target_id text not null default '',
  ip_address text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_cards_product_status on app_cards(product_id, status);
create index if not exists idx_app_cards_plan_status on app_cards(plan_id, status);
create index if not exists idx_app_cards_batch on app_cards(batch_id);
create index if not exists idx_app_cards_device on app_cards(bound_device_code);
create index if not exists idx_app_activations_device on app_activations(device_code);
create index if not exists idx_app_orders_user on app_orders(user_id);
create index if not exists idx_product_plans_product on product_plans(product_id);
create index if not exists idx_card_batches_plan on card_batches(plan_id);
create index if not exists idx_admin_sessions_expiry on admin_sessions(expires_at);
create index if not exists idx_admin_audit_created on admin_audit_logs(created_at desc);

-- 播种只补齐缺失的商品，绝不覆盖后台已经编辑过的字段。
-- （服务每次启动都会执行本文件；若用 on conflict do update，后台改的商品名/价格/链接/状态
--   会在重启后被种子值覆盖回去。）
insert into app_products (id, name, category, description, purchase_url, price_label, prefix, accent, status, sort_order, activation_salt)
values
  ('lvzu_lingqian', '吕祖灵签', '心灵与生活', '在小米手环上随时抽取灵签，获得简洁、安静的每日指引。', 'https://www.ifdian.net/item/3f67aea8590111f1bb3652540025c377', '免费激活', 'LZ', 'saffron', 'available', 10, ''),
  ('qimen_dunjia', '玄枢奇门', '玄学工具', '在手环上随时起局排盘，查看九宫八门九星、十干克应与时局吉凶建议。', 'https://afdian.com/item/e12878f0d79e11f19117525400c8052f', '免费激活', 'QM', 'blue', 'available', 15, 'qimen-dunjia-vela-band10-salt-2026'),
  ('focus_timer', '专注计时器', '效率工具', '为小米手环设计的轻量番茄钟，抬腕即可开始、暂停和查看进度。', '#', '即将上线', 'FT', 'blue', 'coming_soon', 20, ''),
  ('habit_ring', '习惯环', '健康管理', '用清晰的环形进度追踪每日习惯，让坚持变成一眼可见的反馈。', '#', '即将上线', 'HR', 'mint', 'coming_soon', 30, '')
on conflict (id) do nothing;

-- 每应用独立激活盐：留空则回退全局 ACTIVATION_SALT（吕祖灵签即如此）。
-- 只给「已有行但盐为空」的老库补值，不覆盖后台设置过的盐。
update app_products set activation_salt='qimen-dunjia-vela-band10-salt-2026', updated_at=now()
where id='qimen_dunjia' and activation_salt='';

insert into product_plans (product_id, name, prefix, duration_days, max_devices, max_activations, status)
select id, '永久版', prefix, 0, 1, 1, 'active'
from app_products
on conflict (product_id, name) do nothing;

update app_cards c
set plan_id = p.id
from product_plans p
where c.plan_id is null and p.product_id = c.product_id and p.name = '永久版';
