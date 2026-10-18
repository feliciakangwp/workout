-- HYROX Training Dashboard — Supabase schema
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Row-level security makes each athlete's data private to them and to friends
-- who have accepted a friend request; only the owner can change it.

-- Athletes sign up and sign in with a user ID and password. Supabase Auth
-- needs an email, so the app gives every account a hidden login address
-- (<random>@users.hyrox-dashboard.app) that is never shown or emailed.
-- In Authentication → Sign In / Providers → Email, turn OFF "Confirm email".

-- Public profile: the athlete's user ID, unique ignoring case.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9._-]{3,20}$'),
  created_at timestamptz not null default now()
);
-- Earlier versions of this script used display names instead of user IDs.
alter table public.profiles add column if not exists username text;
alter table public.profiles drop column if exists display_name;
create unique index if not exists profiles_username_key on public.profiles (lower(username));

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

-- profiles: any signed-in athlete can read user IDs (for friend lists); only the owner changes theirs.
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
  insert into public.profiles (id, username)
  values (new.id, trim(new.raw_user_meta_data ->> 'username'));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Search other athletes by user ID.
drop function if exists public.search_profiles(text);
create or replace function public.search_profiles(query text)
returns table (id uuid, username text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and length(trim(query)) >= 2
    and p.username ilike '%' || trim(query) || '%'
  order by p.username
  limit 20;
$$;

-- Sign-up and rename check: is this user ID free (ignoring case)? Your own counts as free.
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(trim(p_username)) and id is distinct from auth.uid()
  );
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- Sign-in: the hidden login address for a user ID (only app-made addresses are returned).
create or replace function public.login_email(p_username text)
returns text language sql stable security definer set search_path = public as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.username) = lower(trim(p_username))
    and u.email like '%@users.hyrox-dashboard.app';
$$;
revoke all on function public.login_email(text) from public;
grant execute on function public.login_email(text) to anon, authenticated;
revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;
revoke all on function public.is_friend(uuid) from public, anon;
grant execute on function public.is_friend(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Shared doubles / relay races. Every member can read and edit the race;
-- only the owner (creator) can change members or delete it; tagged members
-- must be the owner's accepted friends; a member can leave.
-- ---------------------------------------------------------------------------
create table if not exists public.shared_races (
  id text primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  members uuid[] not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  check (owner = any (members)),
  check (cardinality(members) between 1 and 4)
);
alter table public.shared_races enable row level security;

drop policy if exists "shared_races: members read" on public.shared_races;
create policy "shared_races: members read" on public.shared_races for select to authenticated
  using (auth.uid() = any (members));
drop policy if exists "shared_races: owner creates" on public.shared_races;
create policy "shared_races: owner creates" on public.shared_races for insert to authenticated
  with check (owner = auth.uid());
drop policy if exists "shared_races: members edit" on public.shared_races;
create policy "shared_races: members edit" on public.shared_races for update to authenticated
  using (auth.uid() = any (members)) with check (auth.uid() = any (members));
drop policy if exists "shared_races: owner deletes" on public.shared_races;
create policy "shared_races: owner deletes" on public.shared_races for delete to authenticated
  using (owner = auth.uid());

create or replace function public.check_shared_race()
returns trigger language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if tg_op = 'UPDATE' then
    if new.owner <> old.owner then raise exception 'The race owner cannot be changed'; end if;
    -- Members may only change by the owner, or by someone removing themselves.
    if new.members is distinct from old.members and auth.uid() <> old.owner
       and new.members is distinct from array_remove(old.members, auth.uid()) then
      raise exception 'Only the person who created the race can change teammates';
    end if;
  end if;
  foreach m in array new.members loop
    if m <> new.owner and not exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester = new.owner and f.addressee = m) or (f.requester = m and f.addressee = new.owner))
    ) then
      raise exception 'Only friends can be tagged in a race';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists shared_races_check on public.shared_races;
create trigger shared_races_check before insert or update on public.shared_races
  for each row execute function public.check_shared_race();

-- A tagged member removes themselves (and their relay legs) from a race.
create or replace function public.leave_shared_race(race_id text)
returns void language sql security definer set search_path = public as $$
  update public.shared_races
  set members = array_remove(members, auth.uid()),
      data = jsonb_set(
        jsonb_set(data, '{members}', coalesce((select jsonb_agg(x) from jsonb_array_elements(data -> 'members') x where x ->> 'id' <> auth.uid()::text), '[]'::jsonb)),
        '{memberStations}', coalesce(data -> 'memberStations', '{}'::jsonb) - auth.uid()::text),
      updated_at = now()
  where id = race_id and auth.uid() = any (members) and owner <> auth.uid();
$$;
revoke all on function public.leave_shared_race(text) from public, anon;
grant execute on function public.leave_shared_race(text) to authenticated;
