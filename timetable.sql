-- supabase.sql을 먼저 적용한 뒤 실행하세요. 별도의 기능 추가 마이그레이션입니다.
create table if not exists public.weekly_lessons (
  id bigint generated always as identity primary key,
  class_name text not null check (char_length(trim(class_name)) between 1 and 100),
  weekday integer not null check (weekday between 1 and 7), -- 월요일 1, 일요일 7
  period integer not null check (period between 1 and 10),
  subject text not null check (char_length(trim(subject)) between 1 and 100),
  unique (class_name, weekday, period)
);

create table if not exists public.lesson_checks (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.profiles(id),
  lesson_date date not null,
  period integer not null check (period between 1 and 10),
  subject text not null,
  attitude text not null check (attitude in ('good', 'okay', 'improve')),
  updated_at timestamptz not null default now(),
  unique (student_id, lesson_date, period)
);
create index if not exists lesson_checks_student_date_idx on public.lesson_checks (student_id, lesson_date);
alter table public.weekly_lessons enable row level security;
alter table public.lesson_checks enable row level security;
revoke all on public.weekly_lessons, public.lesson_checks from anon, authenticated;
grant select on public.weekly_lessons, public.lesson_checks to authenticated;

drop policy if exists "Read own class schedule or teacher reads all" on public.weekly_lessons;
create policy "Read own class schedule or teacher reads all" on public.weekly_lessons for select to authenticated
using (public.is_teacher() or class_name = (select class_name from public.profiles where id = auth.uid()));
drop policy if exists "Read own checks or teacher reads all" on public.lesson_checks;
create policy "Read own checks or teacher reads all" on public.lesson_checks for select to authenticated
using (student_id = auth.uid() or public.is_teacher());

create or replace function public.save_weekly_lesson(target_class text, lesson_weekday integer, lesson_period integer, lesson_subject text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_teacher() then raise exception 'Teacher access required' using errcode = '42501'; end if;
  if target_class is null or char_length(trim(target_class)) not between 1 and 100 or
     lesson_weekday is null or lesson_weekday not between 1 and 7 or lesson_period is null or lesson_period not between 1 and 10 or
     lesson_subject is null or char_length(trim(lesson_subject)) not between 1 and 100 then raise exception 'Invalid lesson'; end if;
  insert into public.weekly_lessons (class_name, weekday, period, subject)
  values (trim(target_class), lesson_weekday, lesson_period, trim(lesson_subject))
  on conflict (class_name, weekday, period) do update set subject = excluded.subject;
end;
$$;
revoke all on function public.save_weekly_lesson(text, integer, integer, text) from public, anon;
grant execute on function public.save_weekly_lesson(text, integer, integer, text) to authenticated;

create or replace function public.save_lesson_check(target_lesson bigint, target_date date, selected_attitude text)
returns void language plpgsql security definer set search_path = '' as $$
declare lesson public.weekly_lessons%rowtype; student_class text;
begin
  select class_name into student_class from public.profiles where id = auth.uid() and role = 'student';
  if student_class is null or trim(student_class) = '' then raise exception 'Student class required' using errcode = '42501'; end if;
  -- 과거 시간표가 바뀐 뒤 잘못된 과목으로 새 기록을 남기지 않도록 당일만 작성합니다.
  if target_date is null or target_date <> (now() at time zone 'Asia/Seoul')::date then raise exception 'Only today can be checked'; end if;
  if selected_attitude is null or selected_attitude not in ('good', 'okay', 'improve') then raise exception 'Invalid attitude'; end if;
  select * into lesson from public.weekly_lessons where id = target_lesson and class_name = student_class and weekday = extract(isodow from target_date)::integer;
  if not found then raise exception 'Lesson does not match student class or date'; end if;
  insert into public.lesson_checks (student_id, lesson_date, period, subject, attitude)
  values (auth.uid(), target_date, lesson.period, lesson.subject, selected_attitude)
  on conflict (student_id, lesson_date, period) do update set subject = excluded.subject, attitude = excluded.attitude, updated_at = now();
end;
$$;
revoke all on function public.save_lesson_check(bigint, date, text) from public, anon;
grant execute on function public.save_lesson_check(bigint, date, text) to authenticated;
