drop policy if exists "public update" on entrants;
drop policy if exists "public delete" on entrants;

create policy "auth update" on entrants for update using (auth.role() = 'authenticated');
create policy "auth delete" on entrants for delete using (auth.role() = 'authenticated');
