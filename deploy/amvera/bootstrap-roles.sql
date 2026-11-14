-- REVIEW ONLY. Run by an administrator INSIDE Amvera AFTER owner approval.
-- Connect to incsoul_stage, not postgres. No passwords belong in this file.
-- Provision incsoul_migrator LOGIN separately in the administrator's secure UI;
-- its password/connection URL is kept only in Amvera Secrets.
begin;
do $$
begin
  if current_database() <> 'incsoul_stage' then raise exception 'Wrong database'; end if;
  if not exists(select 1 from pg_roles where rolname='incsoul_migrator') then
    raise exception 'Provision incsoul_migrator first';
  end if;
end $$;
alter role incsoul_migrator nosuperuser nocreatedb nocreaterole nobypassrls;
alter role incsoul_app nosuperuser nocreatedb nocreaterole nobypassrls;
-- Runtime must not inherit or SET ROLE to the migration owner.
revoke incsoul_migrator from incsoul_app;
alter database incsoul_stage owner to incsoul_migrator;
alter schema public owner to incsoul_migrator;
revoke create,temporary on database incsoul_stage from public,incsoul_app;
revoke create on schema public from public,incsoul_app;
grant connect on database incsoul_stage to incsoul_migrator,incsoul_app;
alter role incsoul_app in database incsoul_stage set search_path = public;
commit;
