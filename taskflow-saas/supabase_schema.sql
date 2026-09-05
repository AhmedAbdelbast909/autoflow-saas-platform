-- =========================================================
-- TaskFlow AI - Production Supabase PostgreSQL DDL Schema
-- Includes Row Level Security (RLS) Policies & Triggers
-- =========================================================

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (Extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT CHECK (role IN ('owner', 'admin', 'member', 'viewer')) DEFAULT 'member',
  plan TEXT CHECK (plan IN ('free', 'pro', 'enterprise')) DEFAULT 'free',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Workspaces Table
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT DEFAULT '🚀',
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Workspace Members (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'admin', 'member', 'viewer')) DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- 4. Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done')) DEFAULT 'todo',
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  due_date DATE DEFAULT (CURRENT_DATE + INTERVAL '7 days'),
  estimated_hours NUMERIC(4, 1) DEFAULT 4.0,
  ai_suggested BOOLEAN DEFAULT FALSE,
  assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Subtasks Table
CREATE TABLE IF NOT EXISTS public.subtasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Activity Logs Table
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  type TEXT DEFAULT 'create',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- Row Level Security (RLS) Policies
-- =========================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: Public read, self-edit
CREATE POLICY "Allow public read on profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Workspaces: Access to workspace members
CREATE POLICY "Members can view workspaces" ON public.workspaces FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = workspaces.id AND user_id = auth.uid()));

-- Tasks: Workspace members can view & edit
CREATE POLICY "Members can manage project tasks" ON public.tasks FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = tasks.project_id AND wm.user_id = auth.uid()
  ));

-- =========================================================
-- Auth Hook: Auto-create profile on new signup
-- =========================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
