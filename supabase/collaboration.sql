-- Manuscript collaboration foundation.
-- Apply only together with a client release that registers projects and routes
-- shared writes through the collaboration API. The current local-first client
-- intentionally shows no fake «Поделиться» button before that release.

create extension if not exists pgcrypto;

create table if not exists manuscript_projects (
  id         text primary key,
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists manuscript_project_members (
  project_id text not null references manuscript_projects on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       text not null check (role in ('owner', 'editor', 'commenter', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create unique index if not exists manuscript_one_owner
  on manuscript_project_members (project_id) where role = 'owner';

create table if not exists manuscript_share_links (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null references manuscript_projects on delete cascade,
  token_hash  bytea not null unique,
  role        text not null check (role in ('editor', 'commenter', 'viewer')),
  created_by  uuid not null default auth.uid() references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  revoked_at  timestamptz
);

create table if not exists manuscript_comment_threads (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null references manuscript_projects on delete cascade,
  scene_id    text not null,
  anchor      jsonb,
  resolved_at timestamptz,
  resolved_by uuid references auth.users on delete set null,
  created_by  uuid not null default auth.uid() references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists manuscript_comments (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references manuscript_comment_threads on delete cascade,
  author_id  uuid not null default auth.uid() references auth.users on delete cascade,
  body       text not null check (length(body) between 1 and 20000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  deleted_at timestamptz
);

create or replace function manuscript_role(pid text) returns text
language sql stable security definer set search_path = public
as $$
  select role from manuscript_project_members
  where project_id = pid and user_id = auth.uid()
$$;

create or replace function manuscript_can_read(pid text) returns boolean
language sql stable security definer set search_path = public
as $$ select manuscript_role(pid) is not null $$;

create or replace function manuscript_can_edit(pid text) returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(manuscript_role(pid) in ('owner', 'editor'), false) $$;

create or replace function manuscript_can_comment(pid text) returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(manuscript_role(pid) in ('owner', 'editor', 'commenter'), false) $$;

create or replace function manuscript_register_project(pid text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into manuscript_projects (id, owner_id) values (pid, auth.uid())
    on conflict (id) do nothing;
  if not exists (select 1 from manuscript_projects where id = pid and owner_id = auth.uid()) then
    raise exception 'project already belongs to another account';
  end if;
  insert into manuscript_project_members (project_id, user_id, role)
    values (pid, auth.uid(), 'owner')
    on conflict (project_id, user_id) do update set role = 'owner';
end $$;

-- Returns the secret once. Only its SHA-256 digest is stored.
create or replace function manuscript_create_share(pid text, share_role text, valid_for interval default interval '7 days')
returns text language plpgsql security definer set search_path = public
as $$
declare token text;
begin
  if manuscript_role(pid) <> 'owner' then raise exception 'owner required'; end if;
  if share_role not in ('editor', 'commenter', 'viewer') then raise exception 'invalid role'; end if;
  token := replace(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=', '');
  insert into manuscript_share_links (project_id, token_hash, role, expires_at)
    values (pid, digest(token, 'sha256'), share_role, now() + valid_for);
  return token;
end $$;

create or replace function manuscript_redeem_share(token text) returns text
language plpgsql security definer set search_path = public
as $$
declare link manuscript_share_links%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into link from manuscript_share_links
    where token_hash = digest(token, 'sha256')
      and revoked_at is null and (expires_at is null or expires_at > now());
  if not found then raise exception 'link is invalid or expired'; end if;
  insert into manuscript_project_members (project_id, user_id, role)
    values (link.project_id, auth.uid(), link.role)
    on conflict (project_id, user_id) do update
      set role = case
        when manuscript_project_members.role = 'owner' then 'owner'
        when manuscript_project_members.role = 'editor' then 'editor'
        else excluded.role
      end;
  return link.project_id;
end $$;

alter table manuscript_projects enable row level security;
alter table manuscript_project_members enable row level security;
alter table manuscript_share_links enable row level security;
alter table manuscript_comment_threads enable row level security;
alter table manuscript_comments enable row level security;

create policy "members read project" on manuscript_projects for select
  using (manuscript_can_read(id));
create policy "members read membership" on manuscript_project_members for select
  using (manuscript_can_read(project_id));
create policy "owners manage membership" on manuscript_project_members for all
  using (manuscript_role(project_id) = 'owner')
  with check (manuscript_role(project_id) = 'owner');
create policy "owners manage share links" on manuscript_share_links for all
  using (manuscript_role(project_id) = 'owner')
  with check (manuscript_role(project_id) = 'owner' and created_by = auth.uid());
create policy "members read threads" on manuscript_comment_threads for select
  using (manuscript_can_read(project_id));
create policy "commenters create threads" on manuscript_comment_threads for insert
  with check (manuscript_can_comment(project_id) and created_by = auth.uid());
create policy "editors resolve threads" on manuscript_comment_threads for update
  using (manuscript_can_edit(project_id)) with check (manuscript_can_edit(project_id));
create policy "members read comments" on manuscript_comments for select
  using (exists (
    select 1 from manuscript_comment_threads t
    where t.id = thread_id and manuscript_can_read(t.project_id)
  ));
create policy "commenters add comments" on manuscript_comments for insert
  with check (author_id = auth.uid() and exists (
    select 1 from manuscript_comment_threads t
    where t.id = thread_id and manuscript_can_comment(t.project_id)
  ));
create policy "authors edit comments" on manuscript_comments for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

grant execute on function manuscript_register_project(text) to authenticated;
grant execute on function manuscript_create_share(text, text, interval) to authenticated;
grant execute on function manuscript_redeem_share(text) to authenticated;
