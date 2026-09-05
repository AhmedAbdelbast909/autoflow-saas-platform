import React from 'react';
import {
  Kanban,
  ListTodo,
  BarChart3,
  Users,
  Timer,
  Database,
  Sparkles,
  FolderPlus,
  Zap
} from 'lucide-react';
import { Project } from '../types';

export type ActiveTab = 'kanban' | 'list' | 'analytics' | 'team' | 'pomodoro' | 'supabase';

interface SidebarProps {
  projects: Project[];
  activeProject: Project;
  onSelectProject: (p: Project) => void;
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  onOpenBilling: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  projects,
  activeProject,
  onSelectProject,
  activeTab,
  onChangeTab,
  onOpenBilling
}) => {
  const navItems: Array<{ id: ActiveTab; label: string; icon: React.ReactNode }> = [
    { id: 'kanban', label: 'Kanban Board', icon: <Kanban size={18} /> },
    { id: 'list', label: 'List View', icon: <ListTodo size={18} /> },
    { id: 'analytics', label: 'Analytics & KPIs', icon: <BarChart3 size={18} /> },
    { id: 'team', label: 'Team Workload', icon: <Users size={18} /> },
    { id: 'pomodoro', label: 'Focus Timer', icon: <Timer size={18} /> },
    { id: 'supabase', label: 'Supabase SQL', icon: <Database size={18} /> }
  ];

  return (
    <aside
      className="glass-panel"
      style={{
        width: '260px',
        borderRadius: 0,
        borderTop: 'none',
        borderBottom: 'none',
        borderLeft: 'none',
        padding: '1.25rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: 'calc(100vh - 65px)',
        overflowY: 'auto'
      }}
    >
      <div>
        {/* Navigation Sections */}
        <div style={{ marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: '0.5rem' }}>
            Main Menu
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onChangeTab(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                    background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                    color: isActive ? '#a5b4fc' : 'var(--text-secondary)',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ color: isActive ? 'var(--accent-primary)' : 'inherit' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Projects Section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Projects
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {projects.map((proj) => {
              const isSelected = activeProject.id === proj.id;
              return (
                <div
                  key={proj.id}
                  onClick={() => onSelectProject(proj)}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                    border: isSelected ? '1px solid var(--border-glow)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: proj.color }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {proj.name}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{proj.taskCount}</span>
                  </div>

                  {/* Progress mini bar */}
                  <div style={{ height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', marginTop: '0.45rem', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${proj.progress}%`, backgroundColor: proj.color, borderRadius: '2px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SaaS Upgrade Card */}
      <div
        className="glass-panel"
        style={{
          padding: '1rem',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(236, 72, 153, 0.08) 100%)',
          borderColor: 'rgba(99, 102, 241, 0.25)',
          borderRadius: 'var(--radius-lg)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
          <Zap size={16} color="#fbbf24" />
          <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>Pro AI Workspaces</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.85rem', lineHeight: 1.4 }}>
          Unlock unlimited AI task breakdowns and Supabase sync.
        </p>
        <button
          className="gradient-btn"
          onClick={onOpenBilling}
          style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', padding: '0.5rem' }}
        >
          Manage Plan
        </button>
      </div>
    </aside>
  );
};
