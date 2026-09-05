export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  plan: 'free' | 'pro' | 'enterprise';
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  icon: string;
  membersCount: number;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  color: string;
  progress: number;
  taskCount: number;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  assignee: {
    name: string;
    avatar: string;
    email: string;
  };
  tags: string[];
  subtasks: Subtask[];
  estimatedHours: number;
  aiSuggested?: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  type: 'create' | 'update' | 'delete' | 'status_change' | 'ai_action';
}
