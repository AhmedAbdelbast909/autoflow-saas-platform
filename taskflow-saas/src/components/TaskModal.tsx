import React, { useState, useEffect } from 'react';
import { X, Sparkles, Plus, Trash2, CheckCircle2, Clock } from 'lucide-react';
import { Task, TaskStatus, TaskPriority, Subtask } from '../types';
import { AIAssistantService } from '../lib/aiAssistant';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTask: (task: Partial<Task>) => void;
  initialTask?: Task | null;
  defaultStatus?: TaskStatus;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSaveTask,
  initialTask,
  defaultStatus = 'todo'
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [estimatedHours, setEstimatedHours] = useState(4);
  const [tagsInput, setTagsInput] = useState('');
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiRationale, setAiRationale] = useState('');

  useEffect(() => {
    if (initialTask) {
      setTitle(initialTask.title);
      setDescription(initialTask.description);
      setStatus(initialTask.status);
      setPriority(initialTask.priority);
      setDueDate(initialTask.dueDate);
      setEstimatedHours(initialTask.estimatedHours || 4);
      setTagsInput(initialTask.tags.join(', '));
      setSubtasks(initialTask.subtasks || []);
    } else {
      setTitle('');
      setDescription('');
      setStatus(defaultStatus);
      setPriority('medium');
      setDueDate(new Date().toISOString().split('T')[0]);
      setEstimatedHours(4);
      setTagsInput('');
      setSubtasks([]);
      setAiRationale('');
    }
  }, [initialTask, defaultStatus, isOpen]);

  if (!isOpen) return null;

  const handleAIAutoBreakdown = async () => {
    if (!title.trim()) {
      alert('Please enter a task title first so the AI can analyze it.');
      return;
    }
    setIsAILoading(true);
    try {
      const result = await AIAssistantService.breakdownTask(title, description);
      setPriority(result.suggestedPriority);
      setEstimatedHours(result.estimatedHours);
      setTagsInput(result.tags.join(', '));
      setAiRationale(result.rationale);

      const generatedSubtasks: Subtask[] = result.suggestedSubtasks.map((st, i) => ({
        id: `st-ai-${Date.now()}-${i}`,
        taskId: initialTask?.id || 'temp',
        title: st,
        completed: false
      }));

      setSubtasks((prev) => [...prev, ...generatedSubtasks]);
    } finally {
      setIsAILoading(false);
    }
  };

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const newSt: Subtask = {
      id: `st-${Date.now()}`,
      taskId: initialTask?.id || 'temp',
      title: newSubtaskTitle.trim(),
      completed: false
    };
    setSubtasks([...subtasks, newSt]);
    setNewSubtaskTitle('');
  };

  const handleToggleSubtask = (id: string) => {
    setSubtasks(subtasks.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)));
  };

  const handleDeleteSubtask = (id: string) => {
    setSubtasks(subtasks.filter((s) => s.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter((t) => t.length > 0);

    onSaveTask({
      id: initialTask ? initialTask.id : undefined,
      title,
      description,
      status,
      priority,
      dueDate,
      estimatedHours: Number(estimatedHours) || 1,
      tags: parsedTags,
      subtasks,
      aiSuggested: Boolean(aiRationale || initialTask?.aiSuggested),
      assignee: initialTask?.assignee || {
        name: 'Ahmed Al-Mansoor',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        email: 'ahmed@taskflow.ai'
      }
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ padding: '1.75rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {initialTask ? 'Edit Task' : 'Create New SaaS Task'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Fill in task parameters or use AI to generate breakdown
            </p>
          </div>

          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Title with AI button */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Task Title *</label>
              <button
                type="button"
                onClick={handleAIAutoBreakdown}
                disabled={isAILoading}
                style={{
                  background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  color: '#d8b4fe',
                  borderRadius: '6px',
                  padding: '0.2rem 0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}
              >
                <Sparkles size={13} />
                <span>{isAILoading ? 'AI Analyzing...' : '✨ AI Auto-Breakdown'}</span>
              </button>
            </div>
            <input
              type="text"
              required
              placeholder="e.g. Implement OAuth2 Supabase Auth Flow"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '0.65rem 0.9rem',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          {/* AI Rationale banner if triggered */}
          {aiRationale && (
            <div
              style={{
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                fontSize: '0.785rem',
                color: '#c7d2fe',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem'
              }}
            >
              <Sparkles size={16} color="#818cf8" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <strong>AI Estimation Insight:</strong> {aiRationale}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              Description & Acceptance Criteria
            </label>
            <textarea
              rows={3}
              placeholder="Describe requirements, expected outcomes, and technical considerations..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '0.65rem 0.9rem',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                outline: 'none',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Status & Priority Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              >
                <option value="backlog">Backlog</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="in_review">In Review</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              >
                <option value="low">🟢 Low Priority</option>
                <option value="medium">🔵 Medium Priority</option>
                <option value="high">🟡 High Priority</option>
                <option value="urgent">🔴 Urgent (Critical)</option>
              </select>
            </div>
          </div>

          {/* Due Date & Estimated Hours */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Estimated Effort (Hours)</label>
              <input
                type="number"
                min="1"
                max="100"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(Number(e.target.value))}
                style={{
                  width: '100%',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              Tags (Comma separated)
            </label>
            <input
              type="text"
              placeholder="e.g. Backend, Auth, API, Supabase"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '0.6rem 0.9rem',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Subtasks Checklist */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              Subtasks ({subtasks.filter((s) => s.completed).length}/{subtasks.length})
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.6rem' }}>
              {subtasks.map((st) => (
                <div
                  key={st.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255, 255, 255, 0.04)',
                    padding: '0.4rem 0.75rem',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={st.completed}
                      onChange={() => handleToggleSubtask(st.id)}
                      style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '0.8rem', textDecoration: st.completed ? 'line-through' : 'none', color: st.completed ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {st.title}
                    </span>
                  </label>
                  <button type="button" onClick={() => handleDeleteSubtask(st.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Add subtask and click Add..."
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                style={{
                  flex: 1,
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.45rem 0.75rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  outline: 'none'
                }}
              />
              <button type="button" className="secondary-btn" onClick={handleAddSubtask} style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}>
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="gradient-btn">
              {initialTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
