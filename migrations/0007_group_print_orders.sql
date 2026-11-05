create table print_uploads (
  request_id uuid not null,
  strip_id uuid not null,
  png bytea not null,
  options jsonb not null,
  created_at timestamptz not null default now(),
  primary key (request_id, strip_id),
  check (octet_length(png) <= 3300000)
);
create index print_uploads_created_idx on print_uploads(created_at);
create table print_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id integer not null references print_orders(id),
  strip_id uuid not null,
  product_type text not null default 'S3' check (product_type = 'S3'),
  quantity integer not null check (quantity between 1 and 12),
  png bytea not null,
  options jsonb not null,
  unique(order_id, strip_id)
);
alter table print_uploads enable row level security;
alter table print_order_items enable row level security;
revoke all on print_uploads, print_order_items from public;
do $$
declare api_role text;
begin
  for api_role in select rolname from pg_roles where rolname in ('anon','authenticated','service_role')
  loop
    execute format('revoke all on print_uploads, print_order_items from %I', api_role);
  end loop;
end $$;
alter table print_order_limits add column upload_attempts integer not null default 0;
