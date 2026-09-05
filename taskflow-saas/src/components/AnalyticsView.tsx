import React from 'react';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Layers,
  Sparkles,
  Activity
} from 'lucide-react';
import { Task, ActivityLog, Project } from '../types';

interface AnalyticsViewProps {
  tasks: Task[];
  projects: Project[];
  activities: ActivityLog[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  tasks,
  projects,
  activities
}) => {
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const urgentTasks = tasks.filter((t) => t.priority === 'urgent' || t.priority === 'high').length;
  const totalEstimatedHours = tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
  const completedHours = tasks
    .filter((t) => t.status === 'done')
    .reduce((sum, t) => sum + (t.estimatedHours || 0), 0);

  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const aiGeneratedCount = tasks.filter((t) => t.aiSuggested).length;

  return (
    <div style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', height: 'calc(100vh - 85px)' }}>
      {/* Page Title */}
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>SaaS Analytics & Team Velocity</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Real-time telemetry, sprint burndown metrics, and activity logs</p>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sprint Completion</span>
            <CheckCircle size={18} color="#10b981" />
          </div>
          <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399' }}>{completionRate}%</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{doneTasks} of {totalTasks} tasks completed</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Effort Logged</span>
            <Clock size={18} color="#6366f1" />
          </div>
          <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#a5b4fc' }}>{completedHours}h / {totalEstimatedHours}h</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{totalEstimatedHours - completedHours}h remaining in sprint</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>High Priority / Urgent</span>
            <AlertCircle size={18} color="#f59e0b" />
          </div>
          <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fbbf24' }}>{urgentTasks}</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Items requiring immediate attention</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>AI Copilot Assisted</span>
            <Sparkles size={18} color="#ec4899" />
          </div>
          <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f472b6' }}>{aiGeneratedCount} Tasks</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Auto-decomposed by AI models</span>
        </div>
      </div>

      {/* Middle Row: Status Distribution & Projects Health */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {/* Status Distribution */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart3 size={18} color="var(--accent-primary)" />
            Task Status Distribution
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {[
              { label: 'Done', count: tasks.filter((t) => t.status === 'done').length, color: '#10b981' },
              { label: 'In Progress', count: tasks.filter((t) => t.status === 'in_progress').length, color: '#f59e0b' },
              { label: 'In Review', count: tasks.filter((t) => t.status === 'in_review').length, color: '#8b5cf6' },
              { label: 'To Do', count: tasks.filter((t) => t.status === 'todo').length, color: '#3b82f6' },
              { label: 'Backlog', count: tasks.filter((t) => t.status === 'backlog').length, color: '#64748b' }
            ].map((st, i) => {
              const pct = totalTasks > 0 ? Math.round((st.count / totalTasks) * 100) : 0;
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>{st.label} ({st.count})</span>
                    <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, backgroundColor: st.color, borderRadius: '4px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Project Overview */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={18} color="#ec4899" />
            Active SaaS Projects
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {projects.map((proj) => (
              <div key={proj.id} style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: proj.color }} />
                    <strong style={{ fontSize: '0.9rem' }}>{proj.name}</strong>
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: proj.color }}>{proj.progress}%</span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{proj.description}</p>
                <div style={{ height: '5px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${proj.progress}%`, backgroundColor: proj.color, borderRadius: '3px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Activity size={18} color="var(--accent-cyan)" />
          Live SaaS Activity Stream
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {activities.map((act) => (
            <div
              key={act.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.04)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: act.type === 'ai_action' ? '#a855f7' : '#6366f1' }} />
                <span style={{ fontSize: '0.825rem' }}>
                  <strong>{act.user}</strong> {act.action} <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{act.target}</span>
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{act.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
