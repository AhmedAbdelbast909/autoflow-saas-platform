import { createClient } from '@supabase/supabase-js';
import { Task, Project, Workspace, UserProfile, ActivityLog } from '../types';

// Read env variables or fallback to demo/configurable mode
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Initial Mock Seed Data
const INITIAL_USER: UserProfile = {
  id: 'usr-1',
  email: 'ahmed.founder@taskflow.ai',
  fullName: 'Ahmed Al-Mansoor',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  role: 'owner',
  plan: 'pro'
};

const INITIAL_WORKSPACES: Workspace[] = [
  { id: 'ws-1', name: 'Acme SaaS Studio', slug: 'acme-saas', icon: '🚀', membersCount: 8 },
  { id: 'ws-2', name: 'FinTech AI Lab', slug: 'fintech-ai', icon: '⚡', membersCount: 4 }
];

const INITIAL_PROJECTS: Project[] = [
  { id: 'proj-1', workspaceId: 'ws-1', name: 'Smart AI Billing V2', description: 'Stripe webhook sync with usage meters', color: '#6366f1', progress: 75, taskCount: 8 },
  { id: 'proj-2', workspaceId: 'ws-1', name: 'Mobile App Launch', description: 'React Native & Expo client build', color: '#ec4899', progress: 40, taskCount: 5 },
  { id: 'proj-3', workspaceId: 'ws-1', name: 'Supabase RLS & Auth', description: 'Database row security & OAuth triggers', color: '#10b981', progress: 90, taskCount: 4 }
];

const INITIAL_TASKS: Task[] = [
  {
    id: 'task-1',
    projectId: 'proj-1',
    title: 'Setup Supabase JWT Authentication & Auth Hooks',
    description: 'Configure OAuth providers (GitHub/Google) and Row Level Security policies on user_profiles table.',
    status: 'in_progress',
    priority: 'urgent',
    dueDate: '2026-09-05',
    assignee: { name: 'Ahmed (Architect)', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', email: 'ahmed@taskflow.ai' },
    tags: ['Backend', 'Security', 'Supabase'],
    subtasks: [
      { id: 'sub-1', taskId: 'task-1', title: 'Create auth.users trigger for profiles', completed: true },
      { id: 'sub-2', taskId: 'task-1', title: 'Add RLS policy for workspace members', completed: true },
      { id: 'sub-3', taskId: 'task-1', title: 'Verify JWT expiration refresh', completed: false }
    ],
    estimatedHours: 6,
    aiSuggested: true,
    createdAt: '2026-08-28T10:00:00Z'
  },
  {
    id: 'task-2',
    projectId: 'proj-1',
    title: 'Design Kanban Drag-and-Drop Board with Glassmorphism',
    description: 'Implement real-time visual task updates, multi-status columns, and micro-animations.',
    status: 'done',
    priority: 'high',
    dueDate: '2026-08-30',
    assignee: { name: 'Sarah (Frontend)', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', email: 'sarah@taskflow.ai' },
    tags: ['Frontend', 'UI/UX', 'React'],
    subtasks: [
      { id: 'sub-4', taskId: 'task-2', title: 'Design card hover glow & badges', completed: true },
      { id: 'sub-5', taskId: 'task-2', title: 'Add confetti animation on task completion', completed: true }
    ],
    estimatedHours: 8,
    aiSuggested: false,
    createdAt: '2026-08-25T09:00:00Z'
  },
  {
    id: 'task-3',
    projectId: 'proj-1',
    title: 'Integrate AI Copilot for Sprint Optimization',
    description: 'Automatic subtask breakdown and task prioritization using LLM prompt pipelines.',
    status: 'in_review',
    priority: 'high',
    dueDate: '2026-09-02',
    assignee: { name: 'Alex (AI Eng)', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', email: 'alex@taskflow.ai' },
    tags: ['AI', 'Prompting', 'Feature'],
    subtasks: [
      { id: 'sub-6', taskId: 'task-3', title: 'Generate smart estimation heuristic', completed: true },
      { id: 'sub-7', taskId: 'task-3', title: 'Implement one-click AI subtask generator', completed: true }
    ],
    estimatedHours: 5,
    aiSuggested: true,
    createdAt: '2026-08-29T14:30:00Z'
  },
  {
    id: 'task-4',
    projectId: 'proj-2',
    title: 'Stripe SaaS Subscription Billing Webhooks',
    description: 'Handle customer.subscription.created, invoice.paid, and customer tier upgrades.',
    status: 'todo',
    priority: 'medium',
    dueDate: '2026-09-10',
    assignee: { name: 'Ahmed (Architect)', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', email: 'ahmed@taskflow.ai' },
    tags: ['Stripe', 'Billing', 'API'],
    subtasks: [
      { id: 'sub-8', taskId: 'task-4', title: 'Setup Stripe webhook signing secret', completed: false },
      { id: 'sub-9', taskId: 'task-4', title: 'Test Pro and Enterprise tier unlocks', completed: false }
    ],
    estimatedHours: 10,
    aiSuggested: false,
    createdAt: '2026-08-29T16:00:00Z'
  },
  {
    id: 'task-5',
    projectId: 'proj-3',
    title: 'Automated E2E Integration Test Suite',
    description: 'Validate critical SaaS workflows: user onboarding, task lifecycle, and export logs.',
    status: 'backlog',
    priority: 'low',
    dueDate: '2026-09-15',
    assignee: { name: 'Elena (QA)', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80', email: 'elena@taskflow.ai' },
    tags: ['Testing', 'E2E', 'Quality'],
    subtasks: [],
    estimatedHours: 4,
    aiSuggested: true,
    createdAt: '2026-08-30T08:00:00Z'
  }
];

const INITIAL_ACTIVITIES: ActivityLog[] = [
  { id: 'act-1', user: 'Ahmed Al-Mansoor', action: 'completed task', target: 'Design Kanban Drag-and-Drop Board', timestamp: '10 minutes ago', type: 'status_change' },
  { id: 'act-2', user: 'AI Assistant', action: 'suggested 3 subtasks for', target: 'Setup Supabase JWT Authentication', timestamp: '45 minutes ago', type: 'ai_action' },
  { id: 'act-3', user: 'Sarah Jenkins', action: 'created project', target: 'Smart AI Billing V2', timestamp: '2 hours ago', type: 'create' }
];

export class LocalStorageStore {
  private static load<T>(key: string, fallback: T): T {
    try {
      const data = localStorage.getItem(`taskflow_${key}`);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  private static save<T>(key: string, data: T): void {
    try {
      localStorage.setItem(`taskflow_${key}`, JSON.stringify(data));
    } catch {}
  }

  static getUser(): UserProfile {
    return this.load('user', INITIAL_USER);
  }

  static saveUser(user: UserProfile): void {
    this.save('user', user);
  }

  static getWorkspaces(): Workspace[] {
    return this.load('workspaces', INITIAL_WORKSPACES);
  }

  static getProjects(): Project[] {
    return this.load('projects', INITIAL_PROJECTS);
  }

  static saveProjects(projects: Project[]): void {
    this.save('projects', projects);
  }

  static getTasks(): Task[] {
    return this.load('tasks', INITIAL_TASKS);
  }

  static saveTasks(tasks: Task[]): void {
    this.save('tasks', tasks);
  }

  static getActivities(): ActivityLog[] {
    return this.load('activities', INITIAL_ACTIVITIES);
  }

  static addActivity(log: Omit<ActivityLog, 'id' | 'timestamp'>): void {
    const list = this.getActivities();
    const item: ActivityLog = {
      ...log,
      id: 'act-' + Date.now(),
      timestamp: 'Just now'
    };
    this.save('activities', [item, ...list.slice(0, 19)]);
  }

  static resetToDefault(): void {
    this.save('user', INITIAL_USER);
    this.save('workspaces', INITIAL_WORKSPACES);
    this.save('projects', INITIAL_PROJECTS);
    this.save('tasks', INITIAL_TASKS);
    this.save('activities', INITIAL_ACTIVITIES);
  }
}
