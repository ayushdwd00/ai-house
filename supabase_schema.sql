-- ==============================================================================
-- AI HOUSE / ATELIER ARCHAI — PRODUCTION DATABASE SCHEMA & ROW LEVEL SECURITY
-- Target Database: Supabase PostgreSQL (Postgres 15+)
-- Description: Sets up profiles, projects, and immutable version snapshots with
-- strict Row Level Security (RLS) enforcing tenant isolation.
-- ==============================================================================

-- 1. PROFILES TABLE
-- Linked directly to auth.users created by Supabase Auth
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies: Users can view and update only their own profile
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);


-- 2. PROJECTS TABLE
-- Stores active canonical HouseLayout models per user
CREATE TABLE IF NOT EXISTS public.projects (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Bespoke Residential Design',
    house_layout JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON public.projects(updated_at DESC);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Projects RLS Policies: Complete user isolation
CREATE POLICY "Users can view their own projects"
    ON public.projects FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects"
    ON public.projects FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
    ON public.projects FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
    ON public.projects FOR DELETE
    USING (auth.uid() = user_id);


-- 3. PROJECT_VERSIONS TABLE
-- Immutable version history snapshots
CREATE TABLE IF NOT EXISTS public.project_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    house_layout JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_project_version UNIQUE (project_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON public.project_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_versions_number ON public.project_versions(project_id, version_number DESC);

ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;

-- Project Versions RLS Policies: Validates ownership of the parent project
CREATE POLICY "Users can view versions of their projects"
    ON public.project_versions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_versions.project_id
            AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert versions for their projects"
    ON public.project_versions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_versions.project_id
            AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete versions of their projects"
    ON public.project_versions FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_versions.project_id
            AND p.user_id = auth.uid()
        )
    );


-- 4. AUTOMATIC PROFILE CREATION TRIGGER
-- When a user signs up via Supabase Auth, automatically initialize their public.profiles row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, created_at)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', new.email),
        timezone('utc'::text, now())
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
