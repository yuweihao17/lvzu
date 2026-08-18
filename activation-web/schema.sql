create table if not exists public.lvzu_cards (
  id bigserial primary key,
  product_id text not null default 'lvzu_lingqian',
  card_code text not null unique,
  status text not null default 'new',
  bound_device_code text not null default '',
  activation_code text not null default '',
  activated_at bigint,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists public.lvzu_afdian_orders (
  id bigserial primary key,
  order_no text not null unique,
  product_id text not null default 'lvzu_lingqian',
  card_code text not null,
  user_id text not null default '',
  plan_id text not null default '',
  product_type text not null default '',
  total_amount text not null default '',
  raw jsonb,
  status text not null default 'new',
  bound_device_code text not null default '',
  activation_code text not null default '',
  activated_at bigint,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists public.lvzu_activations (
  id bigserial primary key,
  product_id text not null default 'lvzu_lingqian',
  card_code text not null,
  source_type text not null,
  source_id text not null,
  device_code text not null,
  activation_code text not null,
  created_at bigint not null
);

create index if not exists idx_lvzu_cards_device on public.lvzu_cards(bound_device_code);
create index if not exists idx_lvzu_orders_card on public.lvzu_afdian_orders(card_code);
create index if not exists idx_lvzu_orders_device on public.lvzu_afdian_orders(bound_device_code);
create index if not exists idx_lvzu_activations_card on public.lvzu_activations(card_code);
create index if not exists idx_lvzu_activations_device on public.lvzu_activations(device_code);

alter table public.lvzu_cards enable row level security;
alter table public.lvzu_afdian_orders enable row level security;
alter table public.lvzu_activations enable row level security;
