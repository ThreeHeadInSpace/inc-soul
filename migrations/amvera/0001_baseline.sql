-- Empty PostgreSQL 17 only. Independent of the Vercel/PGLite migration chain.
-- Executed atomically by scripts/amvera-migrate.mjs, never during app startup.
create table public."user" (
  "id" text primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz not null default CURRENT_TIMESTAMP,
  "updatedAt" timestamptz not null default CURRENT_TIMESTAMP
);
create table public."session" (
  "id" text primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz not null default CURRENT_TIMESTAMP,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references public."user"("id") on delete cascade
);
create table public.account (
  "id" text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references public."user"("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz not null default CURRENT_TIMESTAMP,
  "updatedAt" timestamptz not null
);
create table public.verification (
  "id" text primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default CURRENT_TIMESTAMP,
  "updatedAt" timestamptz not null default CURRENT_TIMESTAMP
);
create index "session_userId_idx" on public."session"("userId");
create index "account_userId_idx" on public.account("userId");
create index verification_identifier_idx on public.verification(identifier);

create table public.order_seq (
  id integer primary key,
  n integer not null default 0,
  constraint order_seq_singleton check (id = 1)
);
-- Technical counter only; no user/order/photo records are seeded.
insert into public.order_seq(id,n) values(1,0);
create table public.print_orders (
  id serial primary key,
  order_number text not null unique default gen_random_uuid()::text,
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
  created_at timestamptz not null default now(),
  user_id text not null default '',
  strip_ids text[] not null default '{}',
  additional_strips jsonb not null default '[]',
  request_id uuid unique,
  order_type text not null default 'standard',
  customer_email text not null default '',
  building_extension text not null default '',
  consent_at timestamptz,
  print_png bytea,
  print_options jsonb,
  notification_status text check(notification_status in ('pending','sending','sent','failed'))
);
create index print_orders_created_at_idx on public.print_orders(created_at desc);
create index print_orders_user_id_idx on public.print_orders(user_id);
-- Actual cabinet queries filter user_id and order by id desc.
create index print_orders_user_id_id_idx on public.print_orders(user_id,id desc);
create table public.strips (
  id serial primary key,
  user_id text not null,
  layout_id text not null,
  filter_id text not null,
  caption text not null default '',
  composite_jpeg text not null,
  shots_jpeg text not null default '[]',
  created_at timestamptz not null default now(),
  strip_id uuid not null default gen_random_uuid()
);
create index strips_user_id_idx on public.strips(user_id,created_at desc);
create index strips_user_id_id_idx on public.strips(user_id,id desc);

create function public.assign_print_order_number() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare next_number integer; digits text;
begin
  update public.order_seq set n = n + 1 where id = 1 and n < 999999
  returning n into next_number;
  if not found then
    raise exception 'Print order number range exhausted or counter missing';
  end if;
  digits := lpad(next_number::text,6,'0');
  update public.print_orders
  set order_number = substr(digits,1,3) || '-' || substr(digits,4,3)
  where id = new.id;
  return null;
end;
$$;
create trigger print_orders_assign_number after insert on public.print_orders
for each row when(new.request_id is not null)
execute function public.assign_print_order_number();

create table public.print_order_limits (
  bucket timestamptz primary key,
  attempts integer not null,
  upload_attempts integer not null default 0
);
create table public.print_uploads (
  request_id uuid not null,
  strip_id uuid not null,
  png bytea not null,
  options jsonb not null,
  created_at timestamptz not null default now(),
  primary key(request_id,strip_id),
  check(octet_length(png) <= 3300000)
);
create index print_uploads_created_idx on public.print_uploads(created_at);
create table public.print_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id integer not null references public.print_orders(id),
  strip_id uuid not null,
  product_type text not null default 'S3' check(product_type = 'S3'),
  quantity integer not null check(quantity between 1 and 12),
  png bytea not null,
  options jsonb not null,
  unique(order_id,strip_id)
);
-- The unique(order_id,strip_id) index also covers the order_id foreign key.

-- Server-only access. RLS policies authorize the service role, not individual
-- website users; existing server authorization must still scope user queries.
do $$
declare t text;
begin
  foreach t in array array['user','session','account','verification','strips',
    'order_seq','print_orders','print_order_limits','print_uploads','print_order_items']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public',t);
    execute format('create policy app_server on public.%I to incsoul_app using(true) with check(true)',t);
  end loop;
end $$;
grant usage on schema public to incsoul_app;
grant select,insert,update,delete on public."user",public."session",public.account,
  public.verification,public.strips to incsoul_app;
grant select,insert,update on public.print_orders,public.print_order_limits to incsoul_app;
grant select,update on public.order_seq to incsoul_app;
grant select,insert,delete on public.print_uploads to incsoul_app;
grant select,insert on public.print_order_items to incsoul_app;
revoke all on sequence public.print_orders_id_seq,public.strips_id_seq from public;
grant usage on sequence public.print_orders_id_seq,public.strips_id_seq to incsoul_app;
revoke all on function public.assign_print_order_number() from public;
grant execute on function public.assign_print_order_number() to incsoul_app;
