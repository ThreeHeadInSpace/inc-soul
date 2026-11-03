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
