-- Owner-private, immutable learning evidence. Applies after the private-beta migration.
-- No provider/service-role keys are needed by these caller-bound functions.
create table public.learning_records (
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('event','exposure','context','run')),
 id uuid not null,
 ordinal bigint generated always as identity,
 data jsonb not null check (pg_column_size(data)<2500000),
 recorded_at timestamptz not null default now(),
 primary key(user_id,kind,id)
);
create index learning_records_owner_order on public.learning_records(user_id,kind,ordinal);
alter table public.learning_records enable row level security;
create policy "owner learning read" on public.learning_records for select to authenticated using (user_id=auth.uid() and public.is_owner());
create policy "owner learning append" on public.learning_records for insert to authenticated with check (user_id=auth.uid() and public.is_owner());
create table public.learning_selection (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision integer not null check(revision>0),
 data jsonb not null check(pg_column_size(data)<1048576)
);
alter table public.learning_selection enable row level security;
create policy "own learning selection read" on public.learning_selection for select to authenticated using(user_id=auth.uid() and public.is_owner());
create policy "own learning selection insert" on public.learning_selection for insert to authenticated with check(user_id=auth.uid() and public.is_owner());
create policy "own learning selection update" on public.learning_selection for update to authenticated using(user_id=auth.uid() and public.is_owner()) with check(user_id=auth.uid() and public.is_owner());
create function public.append_learning_records(records jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare row jsonb; old_data jsonb; ack jsonb:='[]';
begin
 if not public.is_owner() then raise exception 'owner required' using errcode='42501'; end if;
 if jsonb_typeof(records)<>'array' or jsonb_array_length(records)>50 then raise exception 'invalid batch';end if;
 for row in select * from jsonb_array_elements(records) loop
  if row->>'kind' not in ('event','exposure','context','run') or row->'data'->>'id'<>row->>'id' then raise exception 'invalid learning record';end if;
  insert into public.learning_records(user_id,kind,id,data) values(auth.uid(),row->>'kind',(row->>'id')::uuid,row->'data') on conflict do nothing;
  select data into old_data from public.learning_records where user_id=auth.uid() and kind=row->>'kind' and id=(row->>'id')::uuid;
  if old_data is distinct from row->'data' then raise exception 'event id reused';end if;
  ack=ack||jsonb_build_array(row->>'id');
 end loop;
 return ack;
end $$;
create function public.select_learning_model(expected_revision integer,new_data jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare result integer;
begin
 if not public.is_owner() then raise exception 'owner required' using errcode='42501';end if;
 if expected_revision=0 then insert into public.learning_selection values(auth.uid(),1,new_data) on conflict do nothing returning revision into result;
 else update public.learning_selection set revision=revision+1,data=new_data where user_id=auth.uid() and revision=expected_revision returning revision into result;end if;
 return result;
end $$;
revoke all on public.learning_records,public.learning_selection from anon,authenticated;
grant select,insert on public.learning_records to authenticated;
grant usage on sequence public.learning_records_ordinal_seq to authenticated;
grant select,insert,update on public.learning_selection to authenticated;
revoke all on function public.append_learning_records(jsonb),public.select_learning_model(integer,jsonb) from public,anon;
grant execute on function public.append_learning_records(jsonb),public.select_learning_model(integer,jsonb) to authenticated;
-- Owner-triggered deletion also withdraws the selected model. Actual profile saves/hides are separate.
create policy "owner learning delete" on public.learning_records for delete to authenticated using(user_id=auth.uid() and public.is_owner());
create policy "owner selection delete" on public.learning_selection for delete to authenticated using(user_id=auth.uid() and public.is_owner());
grant delete on public.learning_records,public.learning_selection to authenticated;
create function public.clear_learning_history() returns void language plpgsql security invoker set search_path='' as $$
begin
 if not public.is_owner() then raise exception 'owner required' using errcode='42501';end if;
 delete from public.learning_records where user_id=auth.uid();
 delete from public.learning_selection where user_id=auth.uid();
end $$;
revoke all on function public.clear_learning_history() from public,anon;
grant execute on function public.clear_learning_history() to authenticated;
