create table if not exists order_seq (
  id integer primary key,
  n integer not null default 0,
  constraint order_seq_singleton check (id = 1)
);

insert into order_seq (id, n) values (1, 0)
  on conflict (id) do nothing;

create table if not exists print_orders (
  id serial primary key,
  order_number text not null unique,
  layout_id text not null,
  layout_name text not null,
  customer_name text not null,
  phone text not null,
  postal_code text not null,
  region text not null,
  city text not null,
  street text not null,
  building text not null,
  apartment text not null default '',
  copies integer not null default 1,
  print_price integer not null,
  shipping_price integer not null,
  total_price integer not null,
  composite_jpeg text not null,
  shots_jpeg text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists print_orders_created_at_idx
  on print_orders (created_at desc);
