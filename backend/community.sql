-- Applied to the hosted project through execute_sql. Writes only pass through
-- the community Edge Function, which verifies the Supabase account first.
begin;
create schema if not exists community_private;
revoke all on schema community_private from public,anon,authenticated;
grant usage on schema community_private to service_role;
create table community_private.moderators(user_id uuid primary key references auth.users(id) on delete cascade);
grant select on community_private.moderators to service_role;
insert into community_private.moderators(user_id) select user_id from auth.identities where provider='github' and provider_id='336962153' on conflict do nothing;
create table public.community_messages(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null,body text not null check(length(trim(body)) between 1 and 1000),
 created_at timestamptz not null default now(),removed boolean not null default false
);
create index community_messages_created_idx on public.community_messages(created_at desc) where not removed;
create index community_messages_user_idx on public.community_messages(user_id,created_at desc);
create table public.community_models(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null,title text not null check(length(trim(title)) between 3 and 80),
 description text not null check(length(trim(description)) between 10 and 1200),
 license text not null check(license in ('CC0 1.0','CC BY 4.0','CC BY-NC 4.0')),
 file_path text not null unique,byte_size integer not null check(byte_size between 28 and 15728640),
 state text not null default 'pending' check(state in ('pending','published','deleted','failed')),
 created_at timestamptz not null default now()
);
create index community_models_created_idx on public.community_models(created_at desc) where state='published';
create index community_models_user_idx on public.community_models(user_id,created_at desc);
alter table public.community_messages enable row level security;
alter table public.community_models enable row level security;
create policy community_read_messages on public.community_messages for select to anon,authenticated using(not removed);
create policy community_read_models on public.community_models for select to anon,authenticated using(state='published');
revoke all on public.community_messages,public.community_models from anon,authenticated;
grant select on public.community_messages,public.community_models to anon,authenticated;
grant all on public.community_messages,public.community_models to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('community-models','community-models',true,15728640,array['model/gltf-binary']) on conflict(id) do nothing;
-- No client INSERT/UPDATE storage policy: validation cannot be bypassed.
create or replace function public.community_write(p_user_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare player text;moderator boolean;item public.community_models;item_id uuid;new_path text;n bigint;
begin
 -- Only the server calls this function after verifying /auth/v1/user.
 if p_user_id is null then raise exception 'Sign in with a verified account.';end if;
 player:=left(trim(coalesce(p_data->>'_display_name','Player')),30);
 if length(player)<2 then player:='Player';end if;
 select exists(select 1 from community_private.moderators where user_id=p_user_id) into moderator;
 if p_action='session' then return jsonb_build_object('moderator',moderator);end if;
 perform pg_advisory_xact_lock(hashtext(p_user_id::text));
 if p_action='message' then
  if exists(select 1 from public.community_messages where user_id=p_user_id and created_at>now()-interval '3 seconds') then raise exception 'Wait three seconds before sending another message.';end if;
  if (select count(*) from public.community_messages where user_id=p_user_id and created_at>now()-interval '1 hour')>=120 then raise exception 'Please take a break before sending more messages.';end if;
  insert into public.community_messages(user_id,display_name,body) values(p_user_id,player,trim(p_data->>'body')) returning id into item_id;
  return jsonb_build_object('id',item_id);
 elsif p_action='reserve' then
  if coalesce((p_data->>'rights')::boolean,false) is not true then raise exception 'Confirm your permission to share this model.';end if;
  if (select count(*) from public.community_models where user_id=p_user_id and created_at>now()-interval '24 hours')>=5 then raise exception 'You can upload five models per day. Please try tomorrow.';end if;
  if (select count(*) from public.community_models where user_id=p_user_id and state in ('pending','published'))>=20 then raise exception 'Your collection has reached 20 models. Remove one before adding another.';end if;
  if (select coalesce(sum(byte_size),0) from public.community_models where user_id=p_user_id and state in ('pending','published'))+ (p_data->>'byte_size')::integer>104857600 then raise exception 'Your collection is full. Remove a model before adding another.';end if;
  perform pg_advisory_xact_lock(hashtext('incased-community-storage'));
  select coalesce(sum(byte_size),0) into n from public.community_models where state in ('pending','published');
  if n+(p_data->>'byte_size')::integer>786432000 then raise exception 'The community collection is currently full. Please try later.';end if;
  item_id:=gen_random_uuid();new_path:=p_user_id::text||'/'||item_id::text||'.glb';
  insert into public.community_models(id,user_id,display_name,title,description,license,file_path,byte_size) values(item_id,p_user_id,player,trim(p_data->>'title'),trim(p_data->>'description'),p_data->>'license',new_path,(p_data->>'byte_size')::integer);
  return jsonb_build_object('id',item_id,'file_path',new_path);
 elsif p_action in ('publish','cancel','remove_model') then
  select * into item from public.community_models where id=(p_data->>'id')::uuid for update;
  if item.id is null or (item.user_id<>p_user_id and not (moderator and p_action='remove_model')) then raise exception 'You cannot change this model.';end if;
  if p_action='publish' then
   if item.state<>'pending' or not exists(select 1 from storage.objects where bucket_id='community-models' and name=item.file_path and (metadata->>'size')::bigint=item.byte_size) then raise exception 'The uploaded file is not ready.';end if;
   update public.community_models set state='published' where id=item.id;
  else update public.community_models set state=case when p_action='cancel' then 'failed' else 'deleted' end where id=item.id;end if;
  return jsonb_build_object('id',item.id,'file_path',item.file_path);
 elsif p_action='remove_message' then
  update public.community_messages set removed=true where id=(p_data->>'id')::uuid and (user_id=p_user_id or moderator) returning id into item_id;
  if item_id is null then raise exception 'You cannot remove this message.';end if;
  return jsonb_build_object('id',item_id);
 end if;
 raise exception 'Unknown community action.';
end $$;
revoke all on function public.community_write(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.community_write(uuid,text,jsonb) to service_role;
commit;
