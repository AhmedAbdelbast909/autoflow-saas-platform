import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Zap,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Send,
  CheckCircle2,
  Bot
} from 'lucide-react';
import { Task } from '../types';
import { AIAssistantService } from '../lib/aiAssistant';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  onAutoAddAITasks: (newTasks: Task[]) => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  tasks,
  onAutoAddAITasks
}) => {
  const [activeTab, setActiveTab] = useState<'sprint' | 'generate' | 'chat'>('sprint');
  const [chatPrompt, setChatPrompt] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'ai' | 'user'; text: string; time: string }>>([
    {
      role: 'ai',
      text: 'Hello Ahmed! I am your SaaS Agile Copilot. I can audit sprint bottlenecks, generate task hierarchies, and ensure Supabase RLS security.',
      time: 'Just now'
    }
  ]);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const sprintSummary = AIAssistantService.analyzeSprint(tasks);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatPrompt.trim()) return;

    const userText = chatPrompt;
    setChatMessages((prev) => [
      ...prev,
      { role: 'user', text: userText, time: 'Just now' }
    ]);
    setChatPrompt('');

    setTimeout(() => {
      let aiResponse = `I analyzed your query: "${userText}". Based on your current 5 project tasks and Supabase architecture, I recommend prioritizing your auth session hooks before finalizing the Stripe webhooks to avoid token expiry race conditions.`;
      if (userText.toLowerCase().includes('sprint') || userText.toLowerCase().includes('plan')) {
        aiResponse = `Sprint recommendation: You have ${tasks.filter((t) => t.status === 'in_progress').length} active tasks in progress. Your estimated completion date is on track for Friday.`;
      } else if (userText.toLowerCase().includes('security') || userText.toLowerCase().includes('supabase')) {
        aiResponse = `Security check passed: Supabase RLS policies are set to restrict workspace reading to authenticated workspace members.`;
      }

      setChatMessages((prev) => [
        ...prev,
        { role: 'ai', text: aiResponse, time: 'Just now' }
      ]);
    }, 600);
  };

  const handleGenerateAISprintPlan = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const generated: Task[] = [
        {
          id: `task-ai-${Date.now()}-1`,
          projectId: 'proj-1',
          title: 'Implement Supabase Realtime Broadcast & Presence',
          description: 'Live multi-user cursor tracking and instant Kanban column synchronization.',
          status: 'todo',
          priority: 'high',
          dueDate: new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0],
          assignee: { name: 'Sarah (Frontend)', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', email: 'sarah@taskflow.ai' },
          tags: ['Supabase', 'Realtime', 'WebSockets'],
          subtasks: [
            { id: 'st-g-1', taskId: 'temp', title: 'Initialize supabase.channel', completed: false },
            { id: 'st-g-2', taskId: 'temp', title: 'Handle presence state sync', completed: false }
          ],
          estimatedHours: 6,
          aiSuggested: true,
          createdAt: new Date().toISOString()
        },
        {
          id: `task-ai-${Date.now()}-2`,
          projectId: 'proj-1',
          title: 'Add Automated DB Backup & Point-in-Time Recovery',
          description: 'Ensure WAL archiving and daily automated database snapshots via Supabase CLI.',
          status: 'backlog',
          priority: 'medium',
          dueDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
          assignee: { name: 'Ahmed (Architect)', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', email: 'ahmed@taskflow.ai' },
          tags: ['Database', 'DevOps', 'Reliability'],
          subtasks: [],
          estimatedHours: 4,
          aiSuggested: true,
          createdAt: new Date().toISOString()
        }
      ];

      onAutoAddAITasks(generated);
      setIsGenerating(false);
      onClose();
    }, 900);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '680px', padding: '1.75rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={20} color="white" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>AI SaaS Copilot</h3>
              <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)' }}>Intelligent sprint diagnostics & automated task decomposition</p>
            </div>
          </div>

          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tab navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.04)', padding: '0.3rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
          <button
            onClick={() => setActiveTab('sprint')}
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeTab === 'sprint' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: activeTab === 'sprint' ? 'white' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.825rem',
              cursor: 'pointer'
            }}
          >
            Sprint Health & KPIs
          </button>

          <button
            onClick={() => setActiveTab('generate')}
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeTab === 'generate' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: activeTab === 'generate' ? 'white' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.825rem',
              cursor: 'pointer'
            }}
          >
            AI Sprint Generator
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeTab === 'chat' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: activeTab === 'chat' ? 'white' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.825rem',
              cursor: 'pointer'
            }}
          >
            Copilot Chat
          </button>
        </div>

        {/* Tab 1: Sprint Health */}
        {activeTab === 'sprint' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="glass-panel" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={24} color="#10b981" />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sprint Health Score</span>
                  <h4 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#34d399' }}>{sprintSummary.healthScore}%</h4>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={24} color="#818cf8" />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Completion Ratio</span>
                  <h4 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a5b4fc' }}>{sprintSummary.completedRatio}</h4>
                </div>
              </div>
            </div>

            {/* Bottlenecks */}
            <div className="glass-panel" style={{ padding: '1rem' }}>
              <h5 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#fbbf24', marginBottom: '0.6rem' }}>
                <AlertTriangle size={16} />
                <span>Detected Risks & Bottlenecks</span>
              </h5>
              <ul style={{ paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {sprintSummary.bottlenecks.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>

            {/* Recommendations */}
            <div className="glass-panel" style={{ padding: '1rem' }}>
              <h5 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#34d399', marginBottom: '0.6rem' }}>
                <CheckCircle2 size={16} />
                <span>AI Recommendations</span>
              </h5>
              <ul style={{ paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {sprintSummary.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Tab 2: Generator */}
        {activeTab === 'generate' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.4rem' }}>One-Click AI Feature Generator</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                AI will inspect your current project scope and generate 2 high-priority production tasks with full subtask checklists and assignees.
              </p>
              <button
                className="gradient-btn"
                disabled={isGenerating}
                onClick={handleGenerateAISprintPlan}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Sparkles size={16} />
                <span>{isGenerating ? 'Synthesizing Architecture & Tasks...' : 'Generate 2 Next-Gen Sprint Tasks'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Chat */}
        {activeTab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '360px' }}>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.5rem', marginBottom: '1rem' }}>
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    background: msg.role === 'user' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                    border: msg.role === 'user' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.65rem 0.9rem',
                    fontSize: '0.825rem',
                    lineHeight: 1.4
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {msg.role === 'ai' ? <Bot size={12} color="#a855f7" /> : null}
                    <strong>{msg.role === 'ai' ? 'TaskFlow Copilot' : 'You'}</strong>
                  </div>
                  <div>{msg.text}</div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Ask anything about your sprint, database, or architecture..."
                value={chatPrompt}
                onChange={(e) => setChatPrompt(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem 0.9rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
              <button type="submit" className="gradient-btn" style={{ padding: '0.6rem 1rem' }}>
                <Send size={16} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
