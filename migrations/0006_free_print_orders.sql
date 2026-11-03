alter table print_orders
  add column order_type text not null default 'standard',
  add column customer_email text not null default '',
  add column building_extension text not null default '',
  add column consent_at timestamptz,
  add column print_png bytea,
  add column print_options jsonb,
  add column notification_status text check (notification_status in ('pending', 'sending', 'sent', 'failed'));

create table print_order_limits (
  bucket timestamptz primary key,
  attempts integer not null
);

-- Supabase grants Data API roles access to new public tables by default.
-- The app uses a direct server connection as the table owner.
alter table print_orders enable row level security;
alter table print_order_limits enable row level security;
alter table order_seq enable row level security;
alter table _migrations enable row level security;

do $$
declare
  api_role text;
begin
  for api_role in
    select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute format('revoke all on print_orders, print_order_limits, order_seq, _migrations from %I', api_role);
  end loop;
end
$$;
revoke all on print_orders, print_order_limits, order_seq, _migrations from public;
