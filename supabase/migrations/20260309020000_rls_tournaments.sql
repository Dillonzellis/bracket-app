alter table tournaments enable row level security;

create policy "public read" on tournaments for select using (true);
create policy "auth insert" on tournaments for insert with check (auth.role() = 'authenticated');
create policy "auth update" on tournaments for update using (auth.role() = 'authenticated');
create policy "auth delete" on tournaments for delete using (auth.role() = 'authenticated');
