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

create table if not exists public.wow_cards (
  id bigserial primary key,
  product_id text not null default 'the_wow',
  card_code text not null unique,
  sku text not null,
  tier text not null,
  call_count integer not null default 0,
  is_permanent boolean not null default false,
  status text not null default 'new',
  activation_code text not null default '',
  redeemed_at bigint,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists public.wow_licenses (
  id bigserial primary key,
  product_id text not null default 'the_wow',
  activation_code text not null unique,
  status text not null default 'active',
  created_at bigint not null,
  updated_at bigint not null,
  last_seen_at bigint
);

create table if not exists public.wow_license_entitlements (
  id bigserial primary key,
  product_id text not null default 'the_wow',
  activation_code text not null,
  tier text not null,
  remaining_calls integer not null default 0,
  total_calls integer not null default 0,
  is_permanent boolean not null default false,
  source_card_code text not null,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists public.wow_redemptions (
  id bigserial primary key,
  product_id text not null default 'the_wow',
  card_code text not null,
  activation_code text not null,
  sku text not null,
  tier text not null,
  calls integer not null default 0,
  is_permanent boolean not null default false,
  created_at bigint not null
);

create table if not exists public.wow_consumptions (
  id bigserial primary key,
  product_id text not null default 'the_wow',
  activation_code text not null,
  required_tier text not null,
  charged_tier text not null,
  amount integer not null default 1,
  created_at bigint not null
);

create table if not exists public.wow_free_models (
  id bigserial primary key,
  product_id text not null default 'the_wow',
  model_id text not null unique,
  name text not null,
  description text not null default '',
  name_en text not null default '',
  description_en text not null default '',
  provider text not null default 'free',
  base_url text not null default '',
  api_key text not null default '',
  supports_multimodal boolean not null default false,
  enabled boolean not null default true,
  priority integer not null default 0,
  stream boolean not null default true,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists public.wow_model_providers (
  id bigserial primary key,
  product_id text not null default 'the_wow',
  provider_id text not null unique,
  name text not null,
  description text not null default '',
  base_url text not null default '',
  api_key_header text not null default 'authorization-bearer',
  supports_multimodal boolean not null default true,
  enabled boolean not null default true,
  priority integer not null default 0,
  stream boolean not null default true,
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists idx_wow_cards_activation on public.wow_cards(activation_code);
create index if not exists idx_wow_entitlements_activation on public.wow_license_entitlements(activation_code);
create index if not exists idx_wow_redemptions_card on public.wow_redemptions(card_code);
create index if not exists idx_wow_consumptions_activation on public.wow_consumptions(activation_code);
create unique index if not exists idx_wow_free_models_model_id on public.wow_free_models(model_id);
create unique index if not exists idx_wow_model_providers_provider_id on public.wow_model_providers(provider_id);
