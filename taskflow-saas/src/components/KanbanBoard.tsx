import React from 'react';
import {
  Sparkles,
  Calendar,
  CheckSquare,
  Clock,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Edit2,
  Plus
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Task, TaskStatus } from '../types';

interface KanbanBoardProps {
  tasks: Task[];
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onAddNewTaskWithStatus: (status: TaskStatus) => void;
}

const COLUMNS: Array<{ id: TaskStatus; title: string; color: string; badgeColor: string }> = [
  { id: 'backlog', title: 'Backlog', color: '#64748b', badgeColor: 'rgba(100, 116, 139, 0.2)' },
  { id: 'todo', title: 'To Do', color: '#3b82f6', badgeColor: 'rgba(59, 130, 246, 0.2)' },
  { id: 'in_progress', title: 'In Progress', color: '#f59e0b', badgeColor: 'rgba(245, 158, 11, 0.2)' },
  { id: 'in_review', title: 'In Review', color: '#8b5cf6', badgeColor: 'rgba(139, 92, 246, 0.2)' },
  { id: 'done', title: 'Done', color: '#10b981', badgeColor: 'rgba(16, 185, 129, 0.2)' }
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tasks,
  onUpdateTaskStatus,
  onDeleteTask,
  onEditTask,
  onAddNewTaskWithStatus
}) => {
  const handleStatusChange = (taskId: string, nextStatus: TaskStatus) => {
    onUpdateTaskStatus(taskId, nextStatus);
    if (nextStatus === 'done') {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 }
      });
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <span className="badge badge-urgent">Urgent</span>;
      case 'high':
        return <span className="badge badge-high">High</span>;
      case 'medium':
        return <span className="badge badge-medium">Medium</span>;
      default:
        return <span className="badge badge-low">Low</span>;
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(280px, 1fr))',
        gap: '1.25rem',
        padding: '1.5rem',
        overflowX: 'auto',
        minHeight: 'calc(100vh - 85px)'
      }}
    >
      {COLUMNS.map((col, colIndex) => {
        const columnTasks = tasks.filter((t) => t.status === col.id);

        return (
          <div
            key={col.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(15, 23, 42, 0.4)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '1rem',
              height: 'fit-content',
              minHeight: '600px'
            }}
          >
            {/* Column Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: col.color }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{col.title}</span>
                <span
                  style={{
                    background: col.badgeColor,
                    color: col.color,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 700
                  }}
                >
                  {columnTasks.length}
                </span>
              </div>

              <button
                className="icon-btn"
                style={{ width: '28px', height: '28px' }}
                onClick={() => onAddNewTaskWithStatus(col.id)}
                title="Add task in this column"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Tasks Container */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {columnTasks.length === 0 ? (
                <div
                  style={{
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '2rem 1rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.8rem'
                  }}
                >
                  No tasks in {col.title}
                </div>
              ) : (
                columnTasks.map((task) => {
                  const completedSubtasks = task.subtasks.filter((s) => s.completed).length;
                  const totalSubtasks = task.subtasks.length;

                  return (
                    <div
                      key={task.id}
                      className="glass-panel glow-on-hover"
                      style={{
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        cursor: 'default'
                      }}
                    >
                      {/* Top Badges */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {getPriorityBadge(task.priority)}
                          {task.aiSuggested && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                background: 'rgba(168, 85, 247, 0.15)',
                                color: '#d8b4fe',
                                border: '1px solid rgba(168, 85, 247, 0.3)',
                                borderRadius: '9999px',
                                padding: '0.15rem 0.45rem',
                                fontSize: '0.7rem',
                                fontWeight: 700
                              }}
                            >
                              <Sparkles size={11} />
                              AI
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <button
                            className="icon-btn"
                            style={{ width: '24px', height: '24px', border: 'none' }}
                            onClick={() => onEditTask(task)}
                            title="Edit Task"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            className="icon-btn"
                            style={{ width: '24px', height: '24px', border: 'none', color: '#f87171' }}
                            onClick={() => onDeleteTask(task.id)}
                            title="Delete Task"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Title & Description */}
                      <div>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.3rem', lineHeight: 1.3 }}>
                          {task.title}
                        </h4>
                        <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {task.description}
                        </p>
                      </div>

                      {/* Tag Chips */}
                      {task.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {task.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--text-secondary)',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 500
                              }}
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Subtask Progress */}
                      {totalSubtasks > 0 && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.725rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <CheckSquare size={12} />
                              Subtasks
                            </span>
                            <span>{completedSubtasks}/{totalSubtasks}</span>
                          </div>
                          <div style={{ height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${(completedSubtasks / totalSubtasks) * 100}%`,
                                background: 'var(--accent-gradient)',
                                borderRadius: '2px'
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Card Footer: Due Date & Assignee */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.05)', marginTop: '0.2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                          <Calendar size={12} />
                          <span>{task.dueDate}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                            <Clock size={12} />
                            <span>{task.estimatedHours}h</span>
                          </div>
                          <img
                            src={task.assignee.avatar}
                            alt={task.assignee.name}
                            title={task.assignee.name}
                            style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }}
                          />
                        </div>
                      </div>

                      {/* Status Transition Quick Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginTop: '0.2rem' }}>
                        {colIndex > 0 ? (
                          <button
                            className="secondary-btn"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', flex: 1, justifyContent: 'center' }}
                            onClick={() => handleStatusChange(task.id, COLUMNS[colIndex - 1].id)}
                          >
                            <ArrowLeft size={11} />
                            <span>{COLUMNS[colIndex - 1].title}</span>
                          </button>
                        ) : <div style={{ flex: 1 }} />}

                        {colIndex < COLUMNS.length - 1 ? (
                          <button
                            className="secondary-btn"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', flex: 1, justifyContent: 'center', background: 'rgba(99, 102, 241, 0.1)', borderColor: 'rgba(99, 102, 241, 0.3)', color: '#c7d2fe' }}
                            onClick={() => handleStatusChange(task.id, COLUMNS[colIndex + 1].id)}
                          >
                            <span>{COLUMNS[colIndex + 1].title}</span>
                            <ArrowRight size={11} />
                          </button>
                        ) : <div style={{ flex: 1 }} />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
