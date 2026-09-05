import React, { useState } from 'react';
import { X, Check, Zap, Shield, Sparkles, CreditCard } from 'lucide-react';
import confetti from 'canvas-confetti';
import { UserProfile } from '../types';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onUpgradePlan: (newPlan: 'free' | 'pro' | 'enterprise') => void;
}

export const BillingModal: React.FC<BillingModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpgradePlan
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleSelectPlan = (plan: 'free' | 'pro' | 'enterprise') => {
    if (plan === user.plan) return;
    setIsProcessing(true);
    setTimeout(() => {
      onUpgradePlan(plan);
      setIsProcessing(false);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
      onClose();
    }, 800);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '850px', padding: '2rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800 }}>TaskFlow SaaS Subscription & Tiers</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Choose the right tier for your team, powered by Supabase & AI Copilots
            </p>
          </div>

          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Billing cycle toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', padding: '0.35rem', borderRadius: 'var(--radius-md)' }}>
            <button
              onClick={() => setBillingCycle('monthly')}
              style={{
                padding: '0.45rem 1.25rem',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: billingCycle === 'monthly' ? 'var(--accent-primary)' : 'transparent',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.825rem',
                cursor: 'pointer'
              }}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              style={{
                padding: '0.45rem 1.25rem',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: billingCycle === 'yearly' ? 'var(--accent-primary)' : 'transparent',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.825rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <span>Yearly (Save 20%)</span>
              <span style={{ background: '#10b981', color: 'white', fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>SAVE</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
          {/* Free Tier */}
          <div
            className="glass-panel"
            style={{
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              border: user.plan === 'free' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)'
            }}
          >
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Starter</span>
              <div style={{ margin: '0.75rem 0' }}>
                <span style={{ fontSize: '2rem', fontWeight: 800 }}>$0</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> / month</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Essential Kanban task management for individuals.
              </p>

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Check size={14} color="#10b981" /> 1 Workspace & 3 Projects
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Check size={14} color="#10b981" /> Local Store Persistence
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Check size={14} color="#10b981" /> 10 AI Task Breakdowns / mo
                </li>
              </ul>
            </div>

            <button
              className="secondary-btn"
              disabled={user.plan === 'free' || isProcessing}
              onClick={() => handleSelectPlan('free')}
              style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }}
            >
              {user.plan === 'free' ? 'Current Plan' : 'Downgrade to Free'}
            </button>
          </div>

          {/* Pro Tier (Recommended) */}
          <div
            className="glass-panel"
            style={{
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%)',
              border: user.plan === 'pro' ? '2px solid var(--accent-primary)' : '1px solid rgba(99, 102, 241, 0.4)',
              boxShadow: '0 0 24px rgba(99, 102, 241, 0.25)'
            }}
          >
            <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--accent-gradient)', color: 'white', fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.65rem', borderRadius: '9999px', letterSpacing: '0.05em' }}>
              MOST POPULAR
            </div>

            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase' }}>Pro AI</span>
              <div style={{ margin: '0.75rem 0' }}>
                <span style={{ fontSize: '2rem', fontWeight: 800 }}>{billingCycle === 'monthly' ? '$19' : '$15'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> / user / mo</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Complete power tools for teams shipping fast with Supabase & AI.
              </p>

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Check size={14} color="#10b981" /> <strong>Unlimited</strong> Projects & Workspaces
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Check size={14} color="#10b981" /> <strong>Full Supabase Cloud Sync</strong> & RLS
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Check size={14} color="#10b981" /> <strong>Unlimited</strong> AI Task Copilot
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Check size={14} color="#10b981" /> Team Workload & Pomodoro Focus
                </li>
              </ul>
            </div>

            <button
              className="gradient-btn"
              disabled={user.plan === 'pro' || isProcessing}
              onClick={() => handleSelectPlan('pro')}
              style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }}
            >
              {user.plan === 'pro' ? 'Active Plan' : isProcessing ? 'Connecting Stripe...' : 'Upgrade to Pro'}
            </button>
          </div>

          {/* Enterprise Tier */}
          <div
            className="glass-panel"
            style={{
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              border: user.plan === 'enterprise' ? '2px solid var(--accent-rose)' : '1px solid var(--border-subtle)'
            }}
          >
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Enterprise</span>
              <div style={{ margin: '0.75rem 0' }}>
                <span style={{ fontSize: '2rem', fontWeight: 800 }}>{billingCycle === 'monthly' ? '$49' : '$39'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> / user / mo</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Dedicated infrastructure, SSO/SAML, and custom SLAs.
              </p>

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Check size={14} color="#10b981" /> Dedicated Supabase PostgreSQL Instance
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Check size={14} color="#10b981" /> Custom SSO / Okta / Azure AD
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Check size={14} color="#10b981" /> Priority Agent SLA & Support
                </li>
              </ul>
            </div>

            <button
              className="secondary-btn"
              disabled={user.plan === 'enterprise' || isProcessing}
              onClick={() => handleSelectPlan('enterprise')}
              style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }}
            >
              {user.plan === 'enterprise' ? 'Active Plan' : 'Select Enterprise'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
