import React, { useState } from 'react';
import { Database, Check, Copy, ExternalLink, ShieldCheck, Terminal } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';

const SAMPLE_SQL_SCHEMA = `-- ==========================================
-- TaskFlow SaaS Supabase PostgreSQL Schema
-- With Row Level Security (RLS) & Triggers
-- ==========================================

-- 1. Create Workspaces Table
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT DEFAULT '🚀',
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Projects Table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Tasks Table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done')) DEFAULT 'todo',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  due_date DATE,
  estimated_hours NUMERIC(4,1) DEFAULT 4.0,
  ai_suggested BOOLEAN DEFAULT FALSE,
  assignee_id UUID REFERENCES auth.users(id),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies
CREATE POLICY "Users can view workspaces they belong to"
  ON public.workspaces FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can view tasks in their projects"
  ON public.tasks FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.workspaces w ON p.workspace_id = w.id
    WHERE p.id = tasks.project_id AND w.owner_id = auth.uid()
  ));
`;

export const SupabaseSetupBanner: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopySQL = () => {
    navigator.clipboard.writeText(SAMPLE_SQL_SCHEMA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto', height: 'calc(100vh - 85px)' }}>
      {/* Header */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Database size={26} color="#10b981" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Supabase PostgreSQL & Security Hub</h3>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              Status: <span style={{ color: isSupabaseConfigured ? '#34d399' : '#fbbf24', fontWeight: 700 }}>
                {isSupabaseConfigured ? '🟢 Connected to Supabase Cloud' : '🟡 Active in Local Mock & Persistence Mode'}
              </span>
            </p>
          </div>
        </div>

        <button className="gradient-btn" onClick={handleCopySQL}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          <span>{copied ? 'SQL Copied!' : 'Copy SQL Migration'}</span>
        </button>
      </div>

      {/* Instructions Card */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <ShieldCheck size={18} color="#6366f1" />
          Quick Supabase Setup Guide
        </h4>
        <ol style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <li>Go to <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)' }}>supabase.com/dashboard</a> and create a new project.</li>
          <li>Navigate to the <strong>SQL Editor</strong> tab and paste the schema below.</li>
          <li>Copy your <code>Project URL</code> and <code>anon public key</code> into your <code>.env</code> file:</li>
        </ol>

        <div style={{ background: '#0a0f1d', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginTop: '0.75rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: '#38bdf8' }}>
          VITE_SUPABASE_URL="https://your-project.supabase.co"<br />
          VITE_SUPABASE_ANON_KEY="your-anon-key-here"
        </div>
      </div>

      {/* SQL Viewer */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Terminal size={16} color="#a855f7" />
            Complete Supabase DDL Migration Script
          </h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PostgreSQL 15+ / RLS Enabled</span>
        </div>

        <pre style={{ background: '#05070d', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.06)', overflowX: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.775rem', color: '#94a3b8', lineHeight: 1.5 }}>
          {SAMPLE_SQL_SCHEMA}
        </pre>
      </div>
    </div>
  );
};
