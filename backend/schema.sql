-- Apply once in the Supabase SQL editor. No secrets belong in the GitHub repository.
create table public.game_reviews (
 id uuid primary key default gen_random_uuid(),
 game_id text not null check (game_id='forgotten-journey'),
 user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null check (length(display_name) between 2 and 30),
 rating integer not null check (rating between 1 and 5),
 body text not null check (length(body) between 10 and 2000),
 updated_at timestamptz not null default now(),
 unique(game_id,user_id)
);
create table public.bug_reports (
 id uuid primary key default gen_random_uuid(),
 game_id text not null check (game_id='forgotten-journey'),
 title text not null check (length(title) between 5 and 120),
 area text not null check (length(area) between 1 and 60),
 details text not null check (length(details) between 15 and 4000),
 contact_email text check (length(contact_email)<=254),
 release text not null check (length(release)<=100),
 source_hash text not null,
 created_at timestamptz not null default now()
);
alter table public.game_reviews enable row level security;
alter table public.bug_reports enable row level security;
revoke all on public.game_reviews,public.bug_reports from anon,authenticated;
-- Only the bounded RPC functions below can access these tables from the public API.
create or replace function public.public_reviews(p_game_id text)
returns table (display_name text,rating integer,body text,updated_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select r.display_name,r.rating,r.body,r.updated_at from public.game_reviews r
 where r.game_id=p_game_id order by r.updated_at desc;
$$;
create or replace function public.save_review(p_game_id text,p_rating integer,p_body text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare player_name text;verified_at timestamptz;last_update timestamptz;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in with a verified account.';end if;
 select coalesce(u.raw_user_meta_data->>'user_name',u.raw_user_meta_data->>'preferred_username',u.raw_user_meta_data->>'display_name'),u.email_confirmed_at into player_name,verified_at from auth.users u where u.id=auth.uid();
 if verified_at is null then raise exception 'Please verify your email before reviewing.';end if;
 player_name:=left(trim(coalesce(player_name,'Player')),30);
 if length(player_name)<2 then player_name:='Player';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select r.updated_at into last_update from public.game_reviews r where r.user_id=auth.uid() and r.game_id=p_game_id;
 if last_update>now()-interval '30 seconds' then raise exception 'Wait 30 seconds before updating your review.';end if;
 insert into public.game_reviews(game_id,user_id,display_name,rating,body) values(p_game_id,auth.uid(),player_name,p_rating,trim(p_body))
 on conflict(game_id,user_id) do update set display_name=excluded.display_name,rating=excluded.rating,body=excluded.body,updated_at=now();
end;
$$;
create or replace function public.submit_bug_report(p_game_id text,p_title text,p_area text,p_details text,p_contact_email text,p_release text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare headers jsonb;source text;recent integer;
begin
 headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
 source:=md5(coalesce(headers->>'x-forwarded-for',headers->>'x-real-ip','unknown'));
 perform pg_advisory_xact_lock(hashtext(source));
 select count(*) into recent from public.bug_reports where source_hash=source and created_at>now()-interval '10 minutes';
 if recent>=5 then raise exception 'Too many reports. Please wait ten minutes.';end if;
 insert into public.bug_reports(game_id,title,area,details,contact_email,release,source_hash)
 values(p_game_id,trim(p_title),p_area,trim(p_details),nullif(trim(p_contact_email),''),p_release,source);
end;
$$;
revoke all on function public.public_reviews(text),public.save_review(text,integer,text),public.submit_bug_report(text,text,text,text,text,text) from public;
grant execute on function public.public_reviews(text) to anon,authenticated;
grant execute on function public.save_review(text,integer,text) to authenticated;
grant execute on function public.submit_bug_report(text,text,text,text,text,text) to anon,authenticated;
