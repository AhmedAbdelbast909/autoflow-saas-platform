import React, { useState } from 'react';
import { X, Lock, Mail, User, Sparkles, CheckCircle2 } from 'lucide-react';
import { UserProfile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onLogin: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogin
}) => {
  const [email, setEmail] = useState(currentUser.email);
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin({
      ...currentUser,
      email,
      fullName: fullName || email.split('@')[0]
    });
    onClose();
  };

  const handleQuickDemoLogin = (role: 'owner' | 'member' | 'admin', name: string, emailStr: string) => {
    onLogin({
      id: `usr-${Date.now()}`,
      email: emailStr,
      fullName: name,
      avatarUrl:
        role === 'owner'
          ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
          : 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      role,
      plan: role === 'owner' ? 'pro' : 'free'
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '480px', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>
              {isSignUp ? 'Create Supabase Account' : 'TaskFlow Account & Profile'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Manage your authenticated credentials and role permissions
            </p>
          </div>

          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Quick Demo Switcher */}
        <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 'var(--radius-md)', padding: '0.85rem', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem' }}>
            <Sparkles size={14} /> Quick Demo Switcher
          </span>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => handleQuickDemoLogin('owner', 'Ahmed Al-Mansoor', 'ahmed@taskflow.ai')}
              style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', justifyContent: 'center' }}
            >
              Ahmed (Owner)
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => handleQuickDemoLogin('member', 'Sarah Jenkins', 'sarah@taskflow.ai')}
              style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', justifyContent: 'center' }}
            >
              Sarah (Dev)
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              Full Name
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={{ width: '100%', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.9rem 0.6rem 2.4rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.9rem 0.6rem 2.4rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              Supabase Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.9rem 0.6rem 2.4rem', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
              />
            </div>
          </div>

          <button type="submit" className="gradient-btn" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
            {isSignUp ? 'Sign Up' : 'Update Profile & Save'}
          </button>
        </form>
      </div>
    </div>
  );
};
