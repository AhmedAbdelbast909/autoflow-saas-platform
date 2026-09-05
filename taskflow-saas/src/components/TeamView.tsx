import React, { useState } from 'react';
import { Users, UserPlus, Mail, Shield, Award, CheckCircle } from 'lucide-react';
import { Task } from '../types';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Lead Architect' | 'Frontend Dev' | 'AI Engineer' | 'QA Engineer';
  avatar: string;
  maxCapacityHours: number;
}

const INITIAL_TEAM: TeamMember[] = [
  { id: 'm-1', name: 'Ahmed Al-Mansoor', email: 'ahmed@taskflow.ai', role: 'Owner', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', maxCapacityHours: 40 },
  { id: 'm-2', name: 'Sarah Jenkins', email: 'sarah@taskflow.ai', role: 'Frontend Dev', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', maxCapacityHours: 35 },
  { id: 'm-3', name: 'Alex Rivera', email: 'alex@taskflow.ai', role: 'AI Engineer', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', maxCapacityHours: 30 },
  { id: 'm-4', name: 'Elena Rostova', email: 'elena@taskflow.ai', role: 'QA Engineer', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80', maxCapacityHours: 25 }
];

interface TeamViewProps {
  tasks: Task[];
}

export const TeamView: React.FC<TeamViewProps> = ({ tasks }) => {
  const [team, setTeam] = useState<TeamMember[]>(INITIAL_TEAM);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Frontend Dev');
  const [showInviteModal, setShowInviteModal] = useState(false);

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    const newMember: TeamMember = {
      id: `m-${Date.now()}`,
      name: inviteEmail.split('@')[0],
      email: inviteEmail.trim(),
      role: inviteRole as any,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      maxCapacityHours: 35
    };
    setTeam([...team, newMember]);
    setInviteEmail('');
    setShowInviteModal(false);
  };

  return (
    <div style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', height: 'calc(100vh - 85px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Team Members & Workload</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Manage team assignments, capacity allocation, and role permissions
          </p>
        </div>

        <button className="gradient-btn" onClick={() => setShowInviteModal(true)}>
          <UserPlus size={16} />
          <span>Invite Member</span>
        </button>
      </div>

      {/* Team Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {team.map((member) => {
          const assignedTasks = tasks.filter((t) => t.assignee.email.toLowerCase().includes(member.email.toLowerCase()) || member.name.includes(t.assignee.name.split(' ')[0]));
          const totalAssignedHours = assignedTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
          const utilizationPct = Math.min(100, Math.round((totalAssignedHours / member.maxCapacityHours) * 100));

          return (
            <div key={member.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Member Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <img
                  src={member.avatar}
                  alt={member.name}
                  style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-glow)' }}
                />
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>{member.name}</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <Mail size={12} />
                    <span>{member.email}</span>
                  </div>
                </div>
              </div>

              {/* Role badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 700
                  }}
                >
                  {member.role}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{assignedTasks.length} Active Tasks</span>
              </div>

              {/* Workload Capacity Meter */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Workload Capacity</span>
                  <span style={{ fontWeight: 700, color: utilizationPct > 85 ? '#f87171' : '#34d399' }}>
                    {totalAssignedHours}h / {member.maxCapacityHours}h ({utilizationPct}%)
                  </span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${utilizationPct}%`,
                      backgroundColor: utilizationPct > 85 ? '#f87171' : utilizationPct > 60 ? '#fbbf24' : '#10b981',
                      borderRadius: '3px'
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px', padding: '1.75rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.4rem' }}>Invite Team Member</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Send an invitation link with pre-configured role permissions
            </p>

            <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  style={{ width: '100%', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.9rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Assign Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.6rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
                >
                  <option value="Frontend Dev">Frontend Developer</option>
                  <option value="Lead Architect">Lead Architect</option>
                  <option value="AI Engineer">AI Engineer</option>
                  <option value="QA Engineer">QA Engineer</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="secondary-btn" onClick={() => setShowInviteModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="gradient-btn">
                  Send Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
