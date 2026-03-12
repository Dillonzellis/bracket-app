alter table tournaments enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tournaments' and policyname = 'public read') then
    create policy "public read" on tournaments for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tournaments' and policyname = 'auth insert') then
    create policy "auth insert" on tournaments for insert with check (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tournaments' and policyname = 'auth update') then
    create policy "auth update" on tournaments for update using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tournaments' and policyname = 'auth delete') then
    create policy "auth delete" on tournaments for delete using (auth.role() = 'authenticated');
  end if;
end $$;
