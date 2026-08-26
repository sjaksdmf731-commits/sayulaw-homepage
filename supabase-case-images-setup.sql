-- SAYUL 사건사례 이미지 업로드 기능 설정
-- Supabase Dashboard > SQL Editor에서 한 번 실행하세요.

alter table public.cases
  add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-images',
  'case-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/bmp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/bmp'];

create policy "Public case image viewing"
on storage.objects for select
to public
using (bucket_id = 'case-images');

create policy "Admins upload case images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'case-images'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  )
);

create policy "Admins delete case images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'case-images'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  )
);