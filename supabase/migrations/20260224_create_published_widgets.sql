-- Published widgets for the enterprise dashboard widget catalog
create table if not exists public.published_widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  author_name text not null default 'Optimus',
  name text not null,
  description text not null default '',
  category text not null default 'overview',
  config jsonb not null,
  usage_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- RLS: anyone can read, only author can insert/update/delete their own
alter table public.published_widgets enable row level security;

create policy "Anyone can read published widgets"
  on public.published_widgets for select using (true);

create policy "Users can insert their own widgets"
  on public.published_widgets for insert with check (auth.uid() = user_id);

create policy "Users can update their own widgets"
  on public.published_widgets for update using (auth.uid() = user_id);

create policy "Users can delete their own widgets"
  on public.published_widgets for delete using (auth.uid() = user_id);

-- Indexes for catalog queries
create index idx_published_widgets_category on public.published_widgets(category);
create index idx_published_widgets_usage on public.published_widgets(usage_count desc);
