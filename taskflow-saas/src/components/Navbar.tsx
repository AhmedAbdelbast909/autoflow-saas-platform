import React from 'react';
import {
  Sparkles,
  Plus,
  Search,
  Bell,
  SlidersHorizontal,
  Layers,
  CreditCard,
  UserCheck
} from 'lucide-react';
import { Workspace, UserProfile } from '../types';

interface NavbarProps {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  onSelectWorkspace: (ws: Workspace) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenNewTask: () => void;
  onOpenAIModal: () => void;
  onOpenBilling: () => void;
  onOpenAuth: () => void;
  user: UserProfile;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentWorkspace,
  workspaces,
  onSelectWorkspace,
  searchQuery,
  onSearchChange,
  onOpenNewTask,
  onOpenAIModal,
  onOpenBilling,
  onOpenAuth,
  user
}) => {
  return (
    <header className="glass-panel" style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '0.85rem 1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
      {/* Left: Brand & Workspace Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ background: 'var(--accent-gradient)', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(99, 102, 241, 0.5)' }}>
            <Layers size={20} color="white" />
          </div>
          <div>
            <span style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.02em' }}>TaskFlow <span className="gradient-text">AI</span></span>
          </div>
        </div>

        <div style={{ height: '24px', width: '1px', background: 'var(--border-subtle)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.35rem 0.75rem' }}>
          <span>{currentWorkspace.icon}</span>
          <select
            value={currentWorkspace.id}
            onChange={(e) => {
              const found = workspaces.find((w) => w.id === e.target.value);
              if (found) onSelectWorkspace(found);
            }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem', outline: 'none', cursor: 'pointer' }}
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id} style={{ background: '#0f172a', color: 'white' }}>
                {ws.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center: Search Bar */}
      <div style={{ flex: 1, maxWidth: '420px', margin: '0 2rem', position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search tasks, tags, or assignees (Press '/' to focus)..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ width: '100%', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.55rem 1rem 0.55rem 2.4rem', color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', transition: 'border-color 0.2s' }}
        />
      </div>

      {/* Right Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <button
          className="secondary-btn"
          onClick={onOpenAIModal}
          style={{ background: 'rgba(168, 85, 247, 0.1)', borderColor: 'rgba(168, 85, 247, 0.3)', color: '#d8b4fe' }}
        >
          <Sparkles size={16} />
          <span>AI Copilot</span>
        </button>

        <button className="gradient-btn" onClick={onOpenNewTask}>
          <Plus size={18} />
          <span>New Task</span>
        </button>

        <button className="icon-btn" title="Plan & Billing" onClick={onOpenBilling}>
          <CreditCard size={18} />
        </button>

        <div style={{ height: '24px', width: '1px', background: 'var(--border-subtle)' }} />

        {/* User Profile Pill */}
        <div
          onClick={onOpenAuth}
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-subtle)', borderRadius: '9999px', padding: '0.25rem 0.75rem 0.25rem 0.35rem', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <img
            src={user.avatarUrl}
            alt={user.fullName}
            style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.2 }}>{user.fullName.split(' ')[0]}</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', fontWeight: 800 }}>{user.plan}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
