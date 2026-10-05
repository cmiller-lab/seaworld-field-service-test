-- Shared, append-only weekly chemical inventory history.
create table if not exists public.chemical_inventory_counts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  property text not null check (property in ('Aquatica','SeaWorld','Discovery Cove')),
  item text not null check (
    (item = 'Briquettes' and property in ('Aquatica','SeaWorld','Discovery Cove'))
    or (item = 'Stabilizer' and property = 'SeaWorld')
  ),
  pallets integer not null check (pallets between 0 and 200),
  counted_at timestamptz not null default now(),
  technician text not null check (char_length(btrim(technician)) between 1 and 80),
  recorded_at timestamptz not null default now(),
  source text not null default 'live' check (source in ('baseline','live')),
  unique (submission_id, property, item)
);

create index if not exists chemical_inventory_lookup_idx
  on public.chemical_inventory_counts (property, item, counted_at desc, recorded_at desc);

alter table public.chemical_inventory_counts enable row level security;
revoke all on table public.chemical_inventory_counts from anon, authenticated;
grant select, insert on table public.chemical_inventory_counts to anon, authenticated;

drop policy if exists "inventory history readable" on public.chemical_inventory_counts;
create policy "inventory history readable" on public.chemical_inventory_counts
  for select to anon, authenticated using (true);

drop policy if exists "validated inventory counts insertable" on public.chemical_inventory_counts;
create policy "validated inventory counts insertable" on public.chemical_inventory_counts
  for insert to anon, authenticated with check (
    source = 'live'
    and property in ('Aquatica','SeaWorld','Discovery Cove')
    and pallets between 0 and 200
    and char_length(btrim(technician)) between 1 and 80
    and counted_at >= timestamptz '2026-01-01 00:00:00-05'
    and counted_at <= now() + interval '1 day'
    and ((item = 'Briquettes' and property in ('Aquatica','SeaWorld','Discovery Cove'))
      or (item = 'Stabilizer' and property = 'SeaWorld'))
  );

-- Initial physical count supplied for September 24, 2026.
do $$
begin
  if not exists (select 1 from public.chemical_inventory_counts where source='baseline') then
    insert into public.chemical_inventory_counts
      (submission_id, property, item, pallets, counted_at, technician, source)
    select seed.submission_id, v.property, v.item, v.pallets,
      timestamptz '2026-09-24 12:00:00-04', 'Initial inventory', 'baseline'
    from (select gen_random_uuid() submission_id) seed
    cross join (values
      ('Aquatica','Briquettes',20),
      ('SeaWorld','Briquettes',8),
      ('SeaWorld','Stabilizer',1),
      ('Discovery Cove','Briquettes',5)
    ) as v(property,item,pallets);
  end if;
end $$;

notify pgrst, 'reload schema';
