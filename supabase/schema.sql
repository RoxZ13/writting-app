-- Manuscript. — cloud sync schema.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

create sequence if not exists manuscript_seq;

create table if not exists manuscript_records (
  user_id    uuid   not null default auth.uid() references auth.users on delete cascade,
  kind       text   not null,
  id         text   not null,
  data       jsonb  not null,
  updated_at bigint not null,
  seq        bigint not null default nextval('manuscript_seq'),
  primary key (user_id, kind, id)
);

create index if not exists manuscript_records_seq on manuscript_records (user_id, seq);

-- Every write gets a new seq (the pull cursor). An older write never overwrites a newer one.
create or replace function manuscript_bump() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.seq := nextval('manuscript_seq');
  return new;
end $$;

drop trigger if exists manuscript_bump on manuscript_records;
create trigger manuscript_bump before insert or update on manuscript_records
  for each row execute function manuscript_bump();

alter table manuscript_records enable row level security;

drop policy if exists "own records" on manuscript_records;
create policy "own records" on manuscript_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
