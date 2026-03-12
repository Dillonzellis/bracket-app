create table entrants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table entrants enable row level security;

create policy "public read" on entrants for select using (true);
create policy "public insert" on entrants for insert with check (true);
create policy "auth update" on entrants for update using (true);
create policy "auth delete" on entrants for delete using (true);
