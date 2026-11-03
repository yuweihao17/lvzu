-- migrate-v3-product-salt.sql
-- 为已上线的数据库补充「每应用独立激活盐」，并把玄枢奇门(qimen_dunjia)上架到应用目录与激活中心。
-- 幂等：可重复执行。全新数据库由 db/schema.sql 直接包含这些内容，无需再跑本文件。
-- 吕祖灵签的 activation_salt 保持为空，继续回退到全局 ACTIVATION_SALT，行为完全不变。

begin;

alter table app_products add column if not exists activation_salt text not null default '';

insert into app_products (id, name, category, description, purchase_url, price_label, prefix, accent, status, sort_order, activation_salt)
values
  ('qimen_dunjia', '玄枢奇门', '玄学工具', '在手环上随时起局排盘，查看九宫八门九星、十干克应与时局吉凶建议。', 'https://afdian.com/item/e12878f0d79e11f19117525400c8052f', '免费激活', 'QM', 'blue', 'available', 15, 'qimen-dunjia-vela-band10-salt-2026')
on conflict (id) do nothing;

-- 只给「已有行但盐为空」补值；后台设置过的盐与其它字段一律不动。
update app_products set activation_salt='qimen-dunjia-vela-band10-salt-2026', updated_at=now()
where id='qimen_dunjia' and activation_salt='';

insert into product_plans (product_id, name, prefix, duration_days, max_devices, max_activations, status)
select id, '永久版', prefix, 0, 1, 1, 'active'
from app_products
where id = 'qimen_dunjia'
on conflict (product_id, name) do nothing;

commit;