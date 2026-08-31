alter table print_orders
  add column if not exists user_id text not null default '';

create index if not exists print_orders_user_id_idx
  on print_orders (user_id);

create table if not exists strips (
  id serial primary key,
  user_id text not null,
  layout_id text not null,
  filter_id text not null,
  caption text not null default '',
  composite_jpeg text not null,
  shots_jpeg text not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists strips_user_id_idx
  on strips (user_id, created_at desc);
