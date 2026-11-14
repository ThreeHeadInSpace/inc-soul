-- REVIEW ONLY. Run by an administrator INSIDE Amvera AFTER owner approval.
-- Connect to incsoul_stage, not postgres. No passwords belong in this file.
-- Existing LOGIN roles: "incsoulApp" and incsoul_migrator. No role creation or
-- password changes here; connection URLs are kept only in Amvera Secrets.
begin;
do $$
begin
  if current_database() <> 'incsoul_stage' then raise exception 'Wrong database'; end if;
  if not exists(select 1 from pg_roles where rolname='incsoul_migrator') then
    raise exception 'Existing incsoul_migrator role is required';
  end if;
  if not exists(select 1 from pg_roles where rolname='incsoulApp') then
    raise exception 'Existing incsoulApp role is required (case-sensitive)';
  end if;
end $$;
alter role incsoul_migrator nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
alter role "incsoulApp" nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
-- Runtime must not inherit or SET ROLE to the migration owner.
revoke incsoul_migrator from "incsoulApp";
alter database incsoul_stage owner to incsoul_migrator;
alter schema public owner to incsoul_migrator;
revoke create,temporary on database incsoul_stage from public,"incsoulApp";
revoke create on schema public from public,"incsoulApp";
grant connect on database incsoul_stage to incsoul_migrator,"incsoulApp";
alter role "incsoulApp" in database incsoul_stage set search_path = public;
commit;
