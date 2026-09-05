import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Flame, CheckCircle, Target } from 'lucide-react';
import { Task } from '../types';

interface PomodoroTimerProps {
  tasks: Task[];
  onCompleteTaskSession?: (taskId: string) => void;
}

export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ tasks, onCompleteTaskSession }) => {
  const [mode, setMode] = useState<'work' | 'short' | 'long'>('work');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>(tasks[0]?.id || '');
  const [sessionsCompleted, setSessionsCompleted] = useState(3);

  useEffect(() => {
    if (mode === 'work') setTimeLeft(25 * 60);
    else if (mode === 'short') setTimeLeft(5 * 60);
    else if (mode === 'long') setTimeLeft(15 * 60);
    setIsRunning(false);
  }, [mode]);

  useEffect(() => {
    let timer: any = null;
    if (isRunning && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0) {
      setIsRunning(false);
      if (mode === 'work') {
        setSessionsCompleted((s) => s + 1);
        if (selectedTaskId && onCompleteTaskSession) {
          onCompleteTaskSession(selectedTaskId);
        }
      }
    }
    return () => clearInterval(timer);
  }, [isRunning, timeLeft, mode, selectedTaskId, onCompleteTaskSession]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Mode Selector */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.05)', padding: '0.35rem', borderRadius: 'var(--radius-md)', marginBottom: '2rem' }}>
          <button
            onClick={() => setMode('work')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: mode === 'work' ? 'var(--accent-gradient)' : 'transparent',
              color: 'white',
              fontWeight: 700,
              fontSize: '0.825rem',
              cursor: 'pointer'
            }}
          >
            Deep Focus (25m)
          </button>

          <button
            onClick={() => setMode('short')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: mode === 'short' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
              color: 'white',
              fontWeight: 700,
              fontSize: '0.825rem',
              cursor: 'pointer'
            }}
          >
            Short Break (5m)
          </button>

          <button
            onClick={() => setMode('long')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: mode === 'long' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
              color: 'white',
              fontWeight: 700,
              fontSize: '0.825rem',
              cursor: 'pointer'
            }}
          >
            Long Rest (15m)
          </button>
        </div>

        {/* Circular Timer Display */}
        <div
          style={{
            width: '240px',
            height: '240px',
            borderRadius: '50%',
            border: '4px solid var(--border-glow)',
            boxShadow: isRunning ? '0 0 32px rgba(99, 102, 241, 0.4)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '2rem',
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)',
            transition: 'box-shadow 0.3s ease'
          }}
        >
          <span style={{ fontSize: '3.75rem', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.03em' }}>
            {formattedTime}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {mode === 'work' ? 'Focus Session' : 'Rest Period'}
          </span>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="gradient-btn"
            style={{ padding: '0.85rem 2rem', fontSize: '1rem', borderRadius: 'var(--radius-lg)' }}
          >
            {isRunning ? <Pause size={20} /> : <Play size={20} />}
            <span>{isRunning ? 'Pause' : 'Start Focus'}</span>
          </button>

          <button
            className="secondary-btn"
            onClick={() => {
              setIsRunning(false);
              setTimeLeft(mode === 'work' ? 25 * 60 : mode === 'short' ? 5 * 60 : 15 * 60);
            }}
            style={{ padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-lg)' }}
          >
            <RotateCcw size={18} />
          </button>
        </div>

        {/* Attached Task Selector */}
        <div style={{ width: '100%', background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Target size={14} color="var(--accent-primary)" />
              Focusing on Task:
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#fbbf24', fontWeight: 700 }}>
              <Flame size={14} />
              <span>{sessionsCompleted} Streak</span>
            </div>
          </div>

          <select
            value={selectedTaskId}
            onChange={(e) => setSelectedTaskId(e.target.value)}
            style={{
              width: '100%',
              background: '#0f172a',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.55rem',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              outline: 'none'
            }}
          >
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                [{t.priority.toUpperCase()}] {t.title}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
