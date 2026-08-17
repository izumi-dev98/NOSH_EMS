create extension if not exists "pgcrypto";

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  location text not null,
  speaker_trainer text not null,
  description text not null,
  timezone text not null default 'Asia/Yangon',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.events;
create trigger set_updated_at
before update on public.events
for each row
execute function public.handle_updated_at();

alter table public.events enable row level security;

drop policy if exists "allow_all_for_public_demo" on public.events;
create policy "allow_all_for_public_demo"
on public.events
for all
using (true)
with check (true);
