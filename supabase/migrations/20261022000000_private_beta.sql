-- FORME private beta schema.
-- Run in the Supabase SQL editor (or `supabase db push`). Then invite yourself:
--   insert into public.allowed_users (email, role) values ('you@example.com', 'owner');
-- Collection and publishing use the service-role key from the owner's machine only; no policy below lets a browser session write listings.

-- ---------------------------------------------------------------- invite list
create table public.allowed_users (
  email text primary key check (email = lower(email) and email like '%_@_%'),
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);
alter table public.allowed_users enable row level security;

create function public.current_email() returns text
language sql stable set search_path = '' as
$$ select lower(auth.jwt() ->> 'email') $$;

-- Security definer so the check works inside other tables' policies without exposing the whole list.
create function public.is_allowed() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.allowed_users where email = lower(auth.jwt() ->> 'email')) $$;

create function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.allowed_users where email = lower(auth.jwt() ->> 'email') and role = 'owner') $$;

-- A signed-in user can see only their own invite row (the app reads it to learn the role).
create policy "read own invite" on public.allowed_users for select to authenticated
  using (email = public.current_email());

-- ------------------------------------------------------------ personal profile
-- `backup` is the validated FORME settings backup (preferences, display, saved listing snapshots).
create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  backup jsonb not null check (pg_column_size(backup) < 1048576),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
create policy "own profile read" on public.user_profiles for select to authenticated
  using (user_id = auth.uid() and public.is_allowed());

-- Optimistic concurrency in one statement: succeeds only if the caller saw the latest revision.
-- Returns the new revision, or null when another device saved first (revision 0 means "no profile yet").
create function public.save_profile(expected_revision integer, new_backup jsonb) returns integer
language plpgsql security invoker set search_path = '' as
$$
declare result integer;
begin
  if not public.is_allowed() then raise exception 'not invited' using errcode = '42501'; end if;
  if expected_revision = 0 then
    insert into public.user_profiles (user_id, backup) values (auth.uid(), new_backup)
      on conflict (user_id) do nothing returning revision into result;
  else
    update public.user_profiles set backup = new_backup, revision = revision + 1, updated_at = now()
      where user_id = auth.uid() and revision = expected_revision returning revision into result;
  end if;
  return result;
end
$$;
-- security invoker needs write access to run the statements above, restricted to the caller's own row:
create policy "own profile insert" on public.user_profiles for insert to authenticated
  with check (user_id = auth.uid() and public.is_allowed());
create policy "own profile update" on public.user_profiles for update to authenticated
  using (user_id = auth.uid() and public.is_allowed()) with check (user_id = auth.uid() and public.is_allowed());

-- ------------------------------------------------------------ shared listings
-- Written only by the owner's publish script (service role bypasses RLS). Browsers can read, if invited.
create table public.snapshot_meta (
  id integer primary key check (id = 1),
  fetched_at timestamptz not null,
  published_at timestamptz not null default now(),
  queries jsonb not null default '[]',
  extra jsonb not null default '{}'
);
create table public.listings (
  source_key text primary key,
  data jsonb not null,
  published_at timestamptz not null default now()
);
alter table public.snapshot_meta enable row level security;
alter table public.listings enable row level security;
create policy "invited read meta" on public.snapshot_meta for select to authenticated using (public.is_allowed());
create policy "invited read listings" on public.listings for select to authenticated using (public.is_allowed());

-- ---------------------------------------------------------------- privileges
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;
grant select on public.allowed_users, public.snapshot_meta, public.listings to authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant execute on function public.current_email(), public.is_allowed(), public.is_owner(), public.save_profile(integer, jsonb) to authenticated;
