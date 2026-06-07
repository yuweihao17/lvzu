do $$
begin
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

  create index if not exists idx_wow_cards_activation on public.wow_cards(activation_code);
  create index if not exists idx_wow_entitlements_activation on public.wow_license_entitlements(activation_code);
  create index if not exists idx_wow_redemptions_card on public.wow_redemptions(card_code);
  create index if not exists idx_wow_consumptions_activation on public.wow_consumptions(activation_code);
end $$;
