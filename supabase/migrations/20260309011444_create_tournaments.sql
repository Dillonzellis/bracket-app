create table tournaments (
  id uuid primary key,
  name text not null,
  created_at bigint not null,
  default_format int not null,
  state jsonb not null
);
