-- Run this in the Supabase SQL Editor.
-- Create invited users under Authentication > Users, then assign each user's
-- role by replacing the example email and role below.

create table if not exists public.user_roles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    role text not null check (role in ('admin', 'participant')),
    created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

revoke all on public.user_roles from public, anon, authenticated;
grant select on public.user_roles to authenticated;

drop policy if exists "Users can read their own role" on public.user_roles;
create policy "Users can read their own role"
    on public.user_roles
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

create table if not exists public.participants (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(btrim(name)) between 1 and 100),
    phone text not null check (length(btrim(phone)) between 1 and 30),
    address text not null check (length(btrim(address)) between 1 and 250),
    created_at timestamptz not null default now()
);

create table if not exists public.schedules (
    id uuid primary key default gen_random_uuid(),
    activity text not null check (length(btrim(activity)) between 1 and 100),
    place text not null check (length(btrim(place)) between 1 and 150),
    visit_date date not null,
    start_time time not null,
    end_time time not null,
    created_at timestamptz not null default now(),
    check (end_time > start_time)
);

create table if not exists public.lodges (
    id uuid primary key default gen_random_uuid(),
    city text not null check (length(btrim(city)) between 1 and 100),
    name text not null check (length(btrim(name)) between 1 and 150),
    phone text not null check (length(btrim(phone)) between 1 and 30),
    address text not null check (length(btrim(address)) between 1 and 250),
    created_at timestamptz not null default now()
);

create index if not exists schedules_visit_order_idx
    on public.schedules (visit_date, start_time);
create index if not exists lodges_city_name_idx
    on public.lodges (city, name);

alter table public.participants enable row level security;
alter table public.schedules enable row level security;
alter table public.lodges enable row level security;

revoke all on public.participants, public.schedules, public.lodges from public, anon, authenticated;
grant select, insert, update, delete on public.participants, public.schedules, public.lodges to authenticated;

drop policy if exists "Admins manage participants" on public.participants;
create policy "Admins manage participants"
    on public.participants
    for all
    to authenticated
    using (
        exists (
            select 1 from public.user_roles
            where user_id = (select auth.uid()) and role = 'admin'
        )
    )
    with check (
        exists (
            select 1 from public.user_roles
            where user_id = (select auth.uid()) and role = 'admin'
        )
    );

drop policy if exists "Signed-in users read schedules" on public.schedules;
create policy "Signed-in users read schedules"
    on public.schedules
    for select
    to authenticated
    using (
        exists (
            select 1 from public.user_roles
            where user_id = (select auth.uid()) and role in ('admin', 'participant')
        )
    );

drop policy if exists "Admins manage schedules" on public.schedules;
create policy "Admins manage schedules"
    on public.schedules
    for all
    to authenticated
    using (
        exists (
            select 1 from public.user_roles
            where user_id = (select auth.uid()) and role = 'admin'
        )
    )
    with check (
        exists (
            select 1 from public.user_roles
            where user_id = (select auth.uid()) and role = 'admin'
        )
    );

drop policy if exists "Signed-in users read lodges" on public.lodges;
create policy "Signed-in users read lodges"
    on public.lodges
    for select
    to authenticated
    using (
        exists (
            select 1 from public.user_roles
            where user_id = (select auth.uid()) and role in ('admin', 'participant')
        )
    );

drop policy if exists "Admins manage lodges" on public.lodges;
create policy "Admins manage lodges"
    on public.lodges
    for all
    to authenticated
    using (
        exists (
            select 1 from public.user_roles
            where user_id = (select auth.uid()) and role = 'admin'
        )
    )
    with check (
        exists (
            select 1 from public.user_roles
            where user_id = (select auth.uid()) and role = 'admin'
        )
    );

-- Run once per invited user, using the exact email used to create the account.
-- Set the role to either 'admin' or 'participant'.
--
-- insert into public.user_roles (user_id, role)
-- select id, 'admin'
-- from auth.users
-- where email = 'admin@example.com'
-- on conflict (user_id) do update set role = excluded.role;

-- Disable public sign-ups in Authentication > Settings > User Signups.
