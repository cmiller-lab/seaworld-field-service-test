-- Reset working snapshots atomically, preserving every activity and completed-cleaning event.
create or replace function public.reset_feeder_statuses(p_request_id uuid,p_technician text,p_feeders jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare f jsonb; row_id uuid; stamp timestamptz; first_event boolean:=true;
begin
 if p_request_id is null or nullif(trim(p_technician),'') is null then raise exception 'Request ID and technician required';end if;
 if jsonb_typeof(p_feeders)<>'array' or jsonb_array_length(p_feeders)<1 or jsonb_array_length(p_feeders)>100 then raise exception 'Invalid feeder inventory';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 if exists(select 1 from public.feeder_activity where request_id=p_request_id) then return p_request_id;end if;
 -- Acquire the same per-feeder locks as ordinary updates before choosing the reset timestamp.
 for f in select value from jsonb_array_elements(p_feeders) order by value->>'feeder_key' loop
  if nullif(f->>'feeder_key','') is null then raise exception 'Feeder key required';end if;
  perform pg_advisory_xact_lock(hashtextextended(f->>'feeder_key',0));
 end loop;
 stamp:=clock_timestamp();
 perform set_config('app.feeder_skip_audit','yes',true);
 for f in select value from jsonb_array_elements(p_feeders) order by value->>'feeder_key' loop
  select id into row_id from public.feeder_cleanings where feeder_key=f->>'feeder_key' order by month desc,updated_at desc limit 1;
  update public.feeder_cleanings set feed_down_at=null,feed_down_by=null,feed_level=null,level_updated_at=null,cleaned_at=null,cleaned_by=null,note=null,updated_at=stamp where id=row_id;
  insert into public.feeder_activity(feeder_key,property,pool_id,pool_name,feeder_letter,action,occurred_at,recorded_at,technician,payload,source_row_id,request_id)
  values(f->>'feeder_key',f->>'property',f->>'pool',f->>'pool_name',f->>'letter','correction',stamp,stamp,trim(p_technician),jsonb_build_object('status_reset',true,'reason','All current feeder statuses cleared','reset_request_id',p_request_id),row_id,case when first_event then p_request_id else gen_random_uuid() end);
  first_event:=false;
 end loop;
 perform set_config('app.feeder_skip_audit','no',true);
 return p_request_id;
end $$;
revoke all on function public.reset_feeder_statuses(uuid,text,jsonb) from public;
grant execute on function public.reset_feeder_statuses(uuid,text,jsonb) to anon;

-- Record events after acquiring locks so reset ordering also holds for concurrent updates.
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
 insert into public.feeder_activity(feeder_key,property,pool_id,pool_name,feeder_letter,action,occurred_at,recorded_at,technician,payload,source_row_id,request_id)
 values(p_feeder_key,p_property,p_pool_id,p_pool_name,p_letter,p_action,p_occurred_at,clock_timestamp(),trim(p_technician),case when p_action='cleaned' then p_payload||jsonb_build_object('feed_down_at',pending_start) else p_payload end,r.id,p_request_id) returning id into event_id;
 perform set_config('app.feeder_skip_audit','no',true);
 return event_id;
end $$;
revoke all on function public.record_feeder_activity(uuid,text,text,text,text,text,text,text,jsonb,timestamptz) from public;
grant execute on function public.record_feeder_activity(uuid,text,text,text,text,text,text,text,jsonb,timestamptz) to anon;
