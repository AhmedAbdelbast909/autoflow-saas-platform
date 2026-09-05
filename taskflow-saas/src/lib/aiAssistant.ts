import { Task, Subtask, TaskPriority } from '../types';

export interface AIAnalysisResult {
  suggestedSubtasks: string[];
  suggestedPriority: TaskPriority;
  estimatedHours: number;
  tags: string[];
  rationale: string;
}

export interface AISprintSummary {
  healthScore: number;
  completedRatio: string;
  bottlenecks: string[];
  recommendations: string[];
}

export class AIAssistantService {
  /**
   * Smart AI task breakdown into actionable subtasks with estimation
   */
  static async breakdownTask(title: string, description: string): Promise<AIAnalysisResult> {
    // Simulate intelligent LLM processing latency
    await new Promise((r) => setTimeout(r, 800));

    const lower = (title + ' ' + description).toLowerCase();

    let suggestedPriority: TaskPriority = 'medium';
    let estimatedHours = 4;
    const tags: string[] = ['AI-Generated'];
    const suggestedSubtasks: string[] = [];

    if (lower.includes('auth') || lower.includes('security') || lower.includes('login') || lower.includes('jwt')) {
      suggestedPriority = 'urgent';
      estimatedHours = 6;
      tags.push('Security', 'Auth', 'Supabase');
      suggestedSubtasks.push(
        'Define User Entity & DB Schema with RLS Policies',
        'Configure OAuth / JWT Session Expiration & Refresh Hooks',
        'Build Frontend Auth Modal with Form Validation',
        'Write Integration Tests for Auth Edge Cases'
      );
    } else if (lower.includes('stripe') || lower.includes('billing') || lower.includes('payment')) {
      suggestedPriority = 'high';
      estimatedHours = 8;
      tags.push('Stripe', 'Billing', 'Revenue');
      suggestedSubtasks.push(
        'Configure Stripe Customer Portal & Webhook Endpoints',
        'Implement Tier Entitlements (Free / Pro / Enterprise)',
        'Design Upgrade Pricing Modal with Feature Matrix',
        'Handle Failed Invoices & Grace Period Retries'
      );
    } else if (lower.includes('ui') || lower.includes('frontend') || lower.includes('react') || lower.includes('kanban')) {
      suggestedPriority = 'high';
      estimatedHours = 5;
      tags.push('Frontend', 'React', 'UI/UX');
      suggestedSubtasks.push(
        'Setup Accessible Component Hierarchy & Responsive Grid',
        'Implement Glassmorphism Styling & Micro-Interactions',
        'Integrate Drag-and-Drop Column Reordering',
        'Connect State Management with Live Store & Optimistic Updates'
      );
    } else {
      suggestedPriority = 'medium';
      estimatedHours = 3;
      tags.push('Feature', 'Development');
      suggestedSubtasks.push(
        'Draft Technical Architecture & Specification',
        'Implement Core Business Logic & Data Models',
        'Create Frontend Visual Components & Error States',
        'Review Code Quality, Performance & Edge Cases'
      );
    }

    return {
      suggestedSubtasks,
      suggestedPriority,
      estimatedHours,
      tags,
      rationale: `AI analyzed "${title}". Detected keywords suggest a ${suggestedPriority.toUpperCase()} priority tier with estimated ${estimatedHours}h effort.`
    };
  }

  /**
   * Generates automated sprint summary & workload health check
   */
  static analyzeSprint(tasks: Task[]): AISprintSummary {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const urgentPending = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done').length;

    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    let healthScore = Math.min(100, Math.max(30, completionRate + 20 - urgentPending * 15));

    const bottlenecks: string[] = [];
    const recommendations: string[] = [];

    if (urgentPending > 1) {
      bottlenecks.push(`Found ${urgentPending} urgent tasks still pending. Potential sprint blocker.`);
      recommendations.push('Reassign high-priority tasks to unblock critical path.');
    }

    if (inProgress > 4) {
      bottlenecks.push(`High WIP (Work In Progress) limit: ${inProgress} tasks active concurrently.`);
      recommendations.push('Focus team efforts on finishing existing tasks before pulling new ones.');
    }

    if (completionRate > 60) {
      recommendations.push('Sprint velocity is strong! Team is ahead of estimated delivery timeline.');
    } else {
      recommendations.push('Consider moving low-priority backlog items to the next iteration.');
    }

    return {
      healthScore,
      completedRatio: `${done}/${total} (${completionRate}%)`,
      bottlenecks: bottlenecks.length > 0 ? bottlenecks : ['No critical blockers detected.'],
      recommendations
    };
  }
}
