begin;

\i /app/db/schema.sql

alter table app_cards drop constraint if exists app_cards_status_check;
alter table app_cards add column if not exists plan_id uuid references product_plans(id);
alter table app_cards add column if not exists batch_id uuid references card_batches(id);
alter table app_cards add column if not exists expires_at timestamptz;
alter table app_cards add constraint app_cards_status_check check (status in ('new','reserved','used','expired','revoked','disabled'));

create index if not exists idx_app_cards_plan_status on app_cards(plan_id, status);
create index if not exists idx_app_cards_batch on app_cards(batch_id);

commit;
