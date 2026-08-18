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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  card_code text not null unique,
  status text not null default 'new' check (status in ('new','used','disabled')),
  bound_device_code text not null default '',
  activation_code text not null default '',
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create index if not exists idx_app_cards_product_status on app_cards(product_id, status);
create index if not exists idx_app_cards_device on app_cards(bound_device_code);
create index if not exists idx_app_activations_device on app_activations(device_code);
create index if not exists idx_app_orders_user on app_orders(user_id);

insert into app_products (id, name, category, description, purchase_url, price_label, prefix, accent, status, sort_order)
values
  ('lvzu_lingqian', '吕祖灵签', '心灵与生活', '在小米手环上随时抽取灵签，获得简洁、安静的每日指引。', 'https://www.ifdian.net/item/3f67aea8590111f1bb3652540025c377', '免费激活', 'LZ', 'saffron', 'available', 10),
  ('focus_timer', '专注计时器', '效率工具', '为小米手环设计的轻量番茄钟，抬腕即可开始、暂停和查看进度。', '#', '即将上线', 'FT', 'blue', 'coming_soon', 20),
  ('habit_ring', '习惯环', '健康管理', '用清晰的环形进度追踪每日习惯，让坚持变成一眼可见的反馈。', '#', '即将上线', 'HR', 'mint', 'coming_soon', 30)
on conflict (id) do update set name=excluded.name, category=excluded.category, description=excluded.description, purchase_url=excluded.purchase_url, price_label=excluded.price_label, prefix=excluded.prefix, accent=excluded.accent, status=excluded.status, sort_order=excluded.sort_order, updated_at=now();
