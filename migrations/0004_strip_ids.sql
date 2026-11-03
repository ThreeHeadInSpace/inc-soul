alter table print_orders add column strip_ids text[] not null default '{}';
alter table print_orders add column additional_strips jsonb not null default '[]';
alter table strips add column strip_id uuid not null default gen_random_uuid();
