-- FocusHealth: nyckel/värde-lagring per användare, skyddad av RLS.
create table if not exists focushealth_kv (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table focushealth_kv enable row level security;

drop policy if exists "own rows" on focushealth_kv;
create policy "own rows" on focushealth_kv
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
