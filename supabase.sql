-- 새 Supabase 프로젝트의 SQL Editor에서 실행하세요.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  class_name text not null default '' check (char_length(class_name) <= 100),
  role text not null default 'student' check (role in ('student', 'teacher'))
);

create table if not exists public.point_entries (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.profiles(id),
  teacher_id uuid not null references public.profiles(id),
  points integer not null check (points between -100 and 100 and points <> 0),
  reason text not null check (char_length(trim(reason)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists point_entries_student_created_idx on public.point_entries (student_id, created_at desc);

-- 가입 메타데이터로 이름만 설정합니다. 역할은 항상 student로 시작합니다.
create or replace function public.create_profile_for_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, class_name, role)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1), '학생'), 100),
          left(coalesce(trim(new.raw_user_meta_data->>'class_name'), ''), 100), 'student');
  return new;
end;
$$;
revoke all on function public.create_profile_for_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile_for_user();

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;
revoke all on function public.is_teacher() from public, anon;
grant execute on function public.is_teacher() to authenticated;

alter table public.profiles enable row level security;
alter table public.point_entries enable row level security;
revoke all on public.profiles, public.point_entries from anon, authenticated;
grant select on public.profiles, public.point_entries to authenticated;
drop policy if exists "Read own profile or teacher reads all" on public.profiles;
create policy "Read own profile or teacher reads all" on public.profiles for select to authenticated using (id = auth.uid() or public.is_teacher());
drop policy if exists "Read own entries or teacher reads all" on public.point_entries;
create policy "Read own entries or teacher reads all" on public.point_entries for select to authenticated using (student_id = auth.uid() or public.is_teacher());

-- 직접 테이블에 쓰지 않고 권한 및 입력을 검증하는 함수를 통해서만 기록합니다.
create or replace function public.award_points(target_student uuid, point_value integer, entry_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_teacher() then raise exception 'Teacher access required' using errcode = '42501'; end if;
  if target_student is null or not exists (select 1 from public.profiles where id = target_student and role = 'student') then raise exception 'Invalid student'; end if;
  if point_value is null or point_value = 0 or point_value < -100 or point_value > 100 then raise exception 'Invalid points'; end if;
  if entry_reason is null or char_length(trim(entry_reason)) < 1 or char_length(trim(entry_reason)) > 200 then raise exception 'Invalid reason'; end if;
  insert into public.point_entries (student_id, teacher_id, points, reason) values (target_student, auth.uid(), point_value, trim(entry_reason));
end;
$$;
revoke all on function public.award_points(uuid, integer, text) from public, anon;
grant execute on function public.award_points(uuid, integer, text) to authenticated;
