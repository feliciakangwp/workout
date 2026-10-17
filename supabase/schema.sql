-- HYROX Training Dashboard — Supabase schema
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Row-level security makes each athlete's data private to them and to friends
-- who have accepted a friend request; only the owner can change it.

-- Public profile: display name only (email stays private in auth.users).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);

-- Friend requests: pending until the addressee accepts.
create table if not exists public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

-- One JSON document per athlete: logged workouts, goals, races, plan, open workouts.
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.user_data enable row level security;

-- True when the signed-in user and `other` are accepted friends.
create or replace function public.is_friend(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = other) or (f.requester = other and f.addressee = auth.uid()))
  );
$$;

-- profiles: any signed-in athlete can read names (for friend lists); only the owner edits.
drop policy if exists "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- friendships: visible to both people; requester creates a pending request;
-- addressee accepts; either side can remove.
drop policy if exists "friendships: read own" on public.friendships;
create policy "friendships: read own" on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
drop policy if exists "friendships: send request" on public.friendships;
create policy "friendships: send request" on public.friendships for insert to authenticated
  with check (requester = auth.uid() and status = 'pending');
drop policy if exists "friendships: accept" on public.friendships;
create policy "friendships: accept" on public.friendships for update to authenticated
  using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');
drop policy if exists "friendships: remove" on public.friendships;
create policy "friendships: remove" on public.friendships for delete to authenticated
  using (auth.uid() in (requester, addressee));

-- user_data: owner reads and writes; accepted friends read only.
drop policy if exists "user_data: read own or friend" on public.user_data;
create policy "user_data: read own or friend" on public.user_data for select to authenticated
  using (user_id = auth.uid() or public.is_friend(user_id));
drop policy if exists "user_data: insert own" on public.user_data;
create policy "user_data: insert own" on public.user_data for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "user_data: update own" on public.user_data;
create policy "user_data: update own" on public.user_data for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Create the profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Search other athletes by name, or by exact email address, without exposing emails.
create or replace function public.search_profiles(query text)
returns table (id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name
  from public.profiles p
  join auth.users u on u.id = p.id
  where auth.uid() is not null
    and p.id <> auth.uid()
    and length(trim(query)) >= 2
    and (p.display_name ilike '%' || trim(query) || '%' or lower(u.email) = lower(trim(query)))
  order by p.display_name
  limit 20;
$$;
revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;
revoke all on function public.is_friend(uuid) from public, anon;
grant execute on function public.is_friend(uuid) to authenticated;
