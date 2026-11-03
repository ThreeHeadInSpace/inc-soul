alter table print_orders add column request_id uuid unique;
-- Keep retries for orders created while their UUID was also the public number.
update print_orders set request_id = order_number::uuid
where order_number ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

alter table print_orders alter column order_number set default gen_random_uuid()::text;

-- A duplicate request skips the insert and never reaches this trigger.
-- The counter update and order insert commit or roll back together.
create function assign_print_order_number() returns trigger
language plpgsql as $$
declare
  next_number integer;
  digits text;
begin
  update order_seq set n = n + 1
  where id = 1 and n < 999999
  returning n into next_number;

  if not found then
    raise exception 'Print order number range exhausted or counter missing';
  end if;

  digits := lpad(next_number::text, 6, '0');
  update print_orders
  set order_number = substr(digits, 1, 3) || '-' || substr(digits, 4, 3)
  where id = new.id;
  return null;
end;
$$;

create trigger print_orders_assign_number
after insert on print_orders
for each row when (new.request_id is not null)
execute function assign_print_order_number();
