-- Additive activity history; preserves the existing monthly table and clients.
create table if not exists public.feeder_activity (
 id uuid primary key default gen_random_uuid(),
 feeder_key text not null, property text not null, pool_id text not null,
 pool_name text not null, feeder_letter text not null,
 action text not null check(action in ('feed_down','level','cleaned','note','correction')),
 occurred_at timestamptz not null default now(), recorded_at timestamptz not null default now(),
 technician text not null, payload jsonb not null default '{}'::jsonb,
 source_row_id uuid, request_id uuid, source text not null default 'live'
);
create index if not exists feeder_activity_feeder_time on public.feeder_activity(feeder_key,occurred_at desc);
create index if not exists feeder_activity_day on public.feeder_activity(occurred_at desc);
create unique index if not exists feeder_activity_request on public.feeder_activity(request_id) where request_id is not null;
alter table public.feeder_activity enable row level security;
create policy "read feeder activity" on public.feeder_activity for select to anon using(true);
create policy "append feeder activity" on public.feeder_activity for insert to anon with check(true);
grant select,insert on public.feeder_activity to anon;
-- No UPDATE/DELETE permissions: corrections are new events.
create or replace function public.audit_feeder_activity() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a text; at_time timestamptz; who text; details jsonb; old_clean uuid;
begin
 if current_setting('app.feeder_skip_audit',true)='yes' then return new;end if;
 if tg_op='INSERT' or new.feed_down_at is distinct from old.feed_down_at then
  if new.feed_down_at is not null then
   insert into public.feeder_activity(feeder_key,property,pool_id,pool_name,feeder_letter,action,occurred_at,technician,payload,source_row_id)
   values(new.feeder_key,new.property,new.pool_id,new.pool_name,new.feeder_letter,'feed_down',new.feed_down_at,coalesce(nullif(new.feed_down_by,''),'Unknown (legacy)'),jsonb_build_object('level',new.feed_level),new.id);
  elsif tg_op='UPDATE' and old.feed_down_at is not null then
   insert into public.feeder_activity(feeder_key,property,pool_id,pool_name,feeder_letter,action,technician,payload,source_row_id)
   values(new.feeder_key,new.property,new.pool_id,new.pool_name,new.feeder_letter,'correction',coalesce(nullif(new.feed_down_by,''),'Unknown (legacy)'),jsonb_build_object('reason','Feed-down cleared in older app','cancel_feed_down',true),new.id);
  end if;
 end if;
 if tg_op='INSERT' or new.feed_level is distinct from old.feed_level or new.level_updated_at is distinct from old.level_updated_at then
  if new.feed_level is not null then
   insert into public.feeder_activity(feeder_key,property,pool_id,pool_name,feeder_letter,action,occurred_at,technician,payload,source_row_id)
   values(new.feeder_key,new.property,new.pool_id,new.pool_name,new.feeder_letter,'level',coalesce(new.level_updated_at,now()),coalesce(nullif(new.feed_down_by,''),'Unknown (legacy)'),jsonb_build_object('level',new.feed_level),new.id);
  end if;
 end if;
 if tg_op='UPDATE' and old.cleaned_at is not null and new.cleaned_at is distinct from old.cleaned_at and new.feed_down_at is not distinct from old.feed_down_at then
  select id into old_clean from public.feeder_activity where feeder_key=new.feeder_key and action='cleaned' and occurred_at=old.cleaned_at order by recorded_at desc limit 1;
  insert into public.feeder_activity(feeder_key,property,pool_id,pool_name,feeder_letter,action,technician,payload,source_row_id)
  values(new.feeder_key,new.property,new.pool_id,new.pool_name,new.feeder_letter,'correction',coalesce(nullif(new.cleaned_by,''),'Unknown (legacy)'),jsonb_build_object('reason','Cleaning changed in older app','correction_of',old_clean),new.id);
 end if;
 if (tg_op='INSERT' or new.cleaned_at is distinct from old.cleaned_at) and new.cleaned_at is not null then
  insert into public.feeder_activity(feeder_key,property,pool_id,pool_name,feeder_letter,action,occurred_at,technician,payload,source_row_id)
  values(new.feeder_key,new.property,new.pool_id,new.pool_name,new.feeder_letter,'cleaned',new.cleaned_at,coalesce(nullif(new.cleaned_by,''),'Unknown (legacy)'),jsonb_build_object('feed_down_at',new.feed_down_at),new.id);
 end if;
 if (tg_op='INSERT' or new.note is distinct from old.note) and nullif(new.note,'') is not null then
  insert into public.feeder_activity(feeder_key,property,pool_id,pool_name,feeder_letter,action,technician,payload,source_row_id)
  values(new.feeder_key,new.property,new.pool_id,new.pool_name,new.feeder_letter,'note','Unknown (legacy)',jsonb_build_object('note',new.note),new.id);
 end if;
 return new;
end $$;
create trigger feeder_activity_audit after insert or update on public.feeder_cleanings for each row execute function public.audit_feeder_activity();
-- Seed only what survived in existing monthly records. No invented daily checks.
insert into public.feeder_activity(feeder_key,property,pool_id,pool_name,feeder_letter,action,occurred_at,technician,payload,source_row_id,source)
select feeder_key,property,pool_id,pool_name,feeder_letter,'feed_down',feed_down_at,coalesce(nullif(feed_down_by,''),'Unknown (legacy)'),jsonb_build_object('level',feed_level),id,'imported snapshot' from public.feeder_cleanings where feed_down_at is not null
union all select feeder_key,property,pool_id,pool_name,feeder_letter,'level',level_updated_at,coalesce(nullif(feed_down_by,''),'Unknown (legacy)'),jsonb_build_object('level',feed_level),id,'imported snapshot' from public.feeder_cleanings where level_updated_at is not null and feed_level is not null
union all select feeder_key,property,pool_id,pool_name,feeder_letter,'cleaned',cleaned_at,coalesce(nullif(cleaned_by,''),'Unknown (legacy)'),jsonb_build_object('feed_down_at',feed_down_at),id,'imported snapshot' from public.feeder_cleanings where cleaned_at is not null
union all select feeder_key,property,pool_id,pool_name,feeder_letter,'note',updated_at,'Unknown (legacy)',jsonb_build_object('note',note),id,'imported snapshot' from public.feeder_cleanings where nullif(note,'') is not null;
create or replace function public.record_feeder_activity(
 p_request_id uuid,p_feeder_key text,p_property text,p_pool_id text,p_pool_name text,p_letter text,
 p_action text,p_technician text,p_payload jsonb default '{}'::jsonb,p_occurred_at timestamptz default now()
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.feeder_cleanings; prior public.feeder_cleanings; target public.feeder_activity; event_id uuid; month_key text; correction_id uuid; pending_start timestamptz;
begin
 if nullif(trim(p_technician),'') is null then raise exception 'Technician required';end if;
 if p_action not in ('feed_down','level','cleaned','note','correction') then raise exception 'Invalid action';end if;
 if p_occurred_at>now()+interval '5 minutes' then raise exception 'Future timestamps are not allowed';end if;
 if p_action='level' and coalesce(p_payload->>'level','') not in ('100%','75%','50%','25%','Empty') then raise exception 'Invalid feeder level';end if;
 if p_action='note' and nullif(trim(p_payload->>'note'),'') is null then raise exception 'Note required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_feeder_key,0));
 select id into event_id from public.feeder_activity where request_id=p_request_id;
 if event_id is not null then return event_id;end if;
 month_key:=to_char(p_occurred_at at time zone 'America/New_York','YYYY-MM');
 select * into prior from public.feeder_cleanings where feeder_key=p_feeder_key order by month desc,updated_at desc limit 1;
 select * into r from public.feeder_cleanings where feeder_key=p_feeder_key and month=month_key;
 if r.id is null then
  r.id:=gen_random_uuid();r.month:=month_key;r.feeder_key:=p_feeder_key;r.property:=p_property;r.pool_id:=p_pool_id;r.pool_name:=p_pool_name;r.feeder_letter:=p_letter;r.session:=1;
  if prior.feed_down_at is not null and prior.cleaned_at is null then r.feed_down_at:=prior.feed_down_at;r.feed_down_by:=prior.feed_down_by;r.feed_level:=prior.feed_level;r.level_updated_at:=prior.level_updated_at;end if;
 end if;
 if p_action='feed_down' then
  if prior.feed_down_at is not null and prior.cleaned_at is null then raise exception 'Feeder is already feeding down';end if;
  r.feed_down_at:=p_occurred_at;r.feed_down_by:=p_technician;r.feed_level:='100%';r.level_updated_at:=p_occurred_at;r.cleaned_at:=null;r.cleaned_by:=null;
 elsif p_action='level' then
  if r.feed_down_at is null or r.cleaned_at is not null then raise exception 'Start feed-down before updating level';end if;
  r.feed_level:=p_payload->>'level';r.level_updated_at:=p_occurred_at;
 elsif p_action='cleaned' then
  if r.cleaned_at is null then pending_start:=r.feed_down_at;end if;
  if r.feed_down_at is not null and r.cleaned_at is null and p_occurred_at<r.feed_down_at then raise exception 'Cleaning cannot precede feed-down';end if;
  r.cleaned_at:=p_occurred_at;r.cleaned_by:=p_technician;r.feed_level:='Empty';r.level_updated_at:=p_occurred_at;
 elsif p_action='note' then r.note:=p_payload->>'note';
 elsif p_action='correction' then
  if nullif(trim(p_payload->>'reason'),'') is null then raise exception 'Correction reason required';end if;
  correction_id:=(p_payload->>'correction_of')::uuid;
  select * into target from public.feeder_activity where id=correction_id and feeder_key=p_feeder_key and action in ('cleaned','feed_down');
  if target.id is null then raise exception 'Activity record not found';end if;
  if exists(select 1 from public.feeder_activity where action='correction' and payload->>'correction_of'=target.id::text) then raise exception 'Activity already corrected';end if;
  perform set_config('app.feeder_skip_audit','yes',true);
  if target.action='feed_down' then
   if prior.feed_down_at is distinct from target.occurred_at or prior.cleaned_at is not null then raise exception 'Feed-down is no longer active';end if;
   if exists(select 1 from public.feeder_activity where feeder_key=p_feeder_key and action in ('level','cleaned') and recorded_at>target.recorded_at) then raise exception 'Cannot undo feed-down after later level or cleaning work';end if;
   update public.feeder_cleanings set feed_down_at=null,feed_down_by=null,feed_level=null,level_updated_at=null,updated_at=now() where feeder_key=p_feeder_key and feed_down_at=target.occurred_at and cleaned_at is null;
  else
   update public.feeder_cleanings set cleaned_at=null,cleaned_by=null,updated_at=now() where id=target.source_row_id and cleaned_at=target.occurred_at;
  end if;
 end if;
 perform set_config('app.feeder_skip_audit','yes',true);
 if p_action<>'correction' then
  insert into public.feeder_cleanings(id,month,feeder_key,property,pool_id,pool_name,feeder_letter,session,feed_down_at,feed_down_by,cleaned_at,cleaned_by,note,updated_at,audit_note,feed_level,level_updated_at) values(r.id,r.month,r.feeder_key,r.property,r.pool_id,r.pool_name,r.feeder_letter,r.session,r.feed_down_at,r.feed_down_by,r.cleaned_at,r.cleaned_by,r.note,now(),r.audit_note,r.feed_level,r.level_updated_at)
  on conflict(month,feeder_key) do update set feed_down_at=excluded.feed_down_at,feed_down_by=excluded.feed_down_by,cleaned_at=excluded.cleaned_at,cleaned_by=excluded.cleaned_by,note=excluded.note,feed_level=excluded.feed_level,level_updated_at=excluded.level_updated_at,updated_at=now();
 end if;
 insert into public.feeder_activity(feeder_key,property,pool_id,pool_name,feeder_letter,action,occurred_at,technician,payload,source_row_id,request_id)
 values(p_feeder_key,p_property,p_pool_id,p_pool_name,p_letter,p_action,p_occurred_at,trim(p_technician),case when p_action='cleaned' then p_payload||jsonb_build_object('feed_down_at',pending_start) else p_payload end,r.id,p_request_id) returning id into event_id;
 perform set_config('app.feeder_skip_audit','no',true);
 return event_id;
end $$;
revoke all on function public.record_feeder_activity(uuid,text,text,text,text,text,text,text,jsonb,timestamptz) from public;
grant execute on function public.record_feeder_activity(uuid,text,text,text,text,text,text,text,jsonb,timestamptz) to anon;
