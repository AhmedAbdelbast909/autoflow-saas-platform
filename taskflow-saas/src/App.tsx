import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { KanbanBoard } from './components/KanbanBoard';
import { TaskModal } from './components/TaskModal';
import { AIAssistantModal } from './components/AIAssistantModal';
import { AnalyticsView } from './components/AnalyticsView';
import { PomodoroTimer } from './components/PomodoroTimer';
import { BillingModal } from './components/BillingModal';
import { AuthModal } from './components/AuthModal';
import { SupabaseSetupBanner } from './components/SupabaseSetupBanner';
import { TeamView } from './components/TeamView';
import { LocalStorageStore } from './lib/supabase';
import { Task, Project, Workspace, UserProfile, TaskStatus } from './types';

export function App() {
  const [user, setUser] = useState<UserProfile>(LocalStorageStore.getUser());
  const [workspaces, setWorkspaces] = useState<Workspace[]>(LocalStorageStore.getWorkspaces());
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace>(workspaces[0]);
  const [projects, setProjects] = useState<Project[]>(LocalStorageStore.getProjects());
  const [activeProject, setActiveProject] = useState<Project>(projects[0]);
  const [tasks, setTasks] = useState<Task[]>(LocalStorageStore.getTasks());
  const [activities, setActivities] = useState(LocalStorageStore.getActivities());

  const [activeTab, setActiveTab] = useState<ActiveTab>('kanban');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultTaskStatus, setDefaultTaskStatus] = useState<TaskStatus>('todo');
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Sync to store
  useEffect(() => {
    LocalStorageStore.saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    LocalStorageStore.saveProjects(projects);
  }, [projects]);

  useEffect(() => {
    LocalStorageStore.saveUser(user);
  }, [user]);

  // Handlers
  const handleSaveTask = (taskData: Partial<Task>) => {
    if (taskData.id) {
      // Edit
      setTasks((prev) =>
        prev.map((t) => (t.id === taskData.id ? ({ ...t, ...taskData } as Task) : t))
      );
      LocalStorageStore.addActivity({
        user: user.fullName,
        action: 'updated task',
        target: taskData.title || 'Task',
        type: 'update'
      });
    } else {
      // New
      const newTask: Task = {
        id: `task-${Date.now()}`,
        projectId: activeProject.id,
        title: taskData.title || 'Untitled Task',
        description: taskData.description || '',
        status: taskData.status || defaultTaskStatus,
        priority: taskData.priority || 'medium',
        dueDate: taskData.dueDate || new Date().toISOString().split('T')[0],
        estimatedHours: taskData.estimatedHours || 4,
        tags: taskData.tags || [],
        subtasks: taskData.subtasks || [],
        aiSuggested: Boolean(taskData.aiSuggested),
        createdAt: new Date().toISOString(),
        assignee: taskData.assignee || {
          name: user.fullName,
          avatar: user.avatarUrl,
          email: user.email
        }
      };

      setTasks((prev) => [newTask, ...prev]);
      LocalStorageStore.addActivity({
        user: user.fullName,
        action: 'created task',
        target: newTask.title,
        type: 'create'
      });
    }
    setActivities(LocalStorageStore.getActivities());
  };

  const handleUpdateTaskStatus = (taskId: string, newStatus: TaskStatus) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    const targetTask = tasks.find((t) => t.id === taskId);
    if (targetTask) {
      LocalStorageStore.addActivity({
        user: user.fullName,
        action: `moved task to ${newStatus.replace('_', ' ')}`,
        target: targetTask.title,
        type: 'status_change'
      });
      setActivities(LocalStorageStore.getActivities());
    }
  };

  const handleDeleteTask = (taskId: string) => {
    const targetTask = tasks.find((t) => t.id === taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    if (targetTask) {
      LocalStorageStore.addActivity({
        user: user.fullName,
        action: 'deleted task',
        target: targetTask.title,
        type: 'delete'
      });
      setActivities(LocalStorageStore.getActivities());
    }
  };

  const handleOpenEdit = (task: Task) => {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };

  const handleAddNewTaskWithStatus = (status: TaskStatus) => {
    setEditingTask(null);
    setDefaultTaskStatus(status);
    setIsTaskModalOpen(true);
  };

  const handleAutoAddAITasks = (newTasks: Task[]) => {
    setTasks((prev) => [...newTasks, ...prev]);
    LocalStorageStore.addActivity({
      user: 'AI Copilot',
      action: `synthesized ${newTasks.length} new tasks for`,
      target: activeProject.name,
      type: 'ai_action'
    });
    setActivities(LocalStorageStore.getActivities());
  };

  const handleUpgradePlan = (newPlan: 'free' | 'pro' | 'enterprise') => {
    const updated = { ...user, plan: newPlan };
    setUser(updated);
    LocalStorageStore.saveUser(updated);
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    const matchProject = t.projectId === activeProject.id || activeTab !== 'kanban';
    const matchQuery =
      searchQuery.trim() === '' ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.assignee.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchProject && matchQuery;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Top Navbar */}
      <Navbar
        currentWorkspace={currentWorkspace}
        workspaces={workspaces}
        onSelectWorkspace={setCurrentWorkspace}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenNewTask={() => {
          setEditingTask(null);
          setDefaultTaskStatus('todo');
          setIsTaskModalOpen(true);
        }}
        onOpenAIModal={() => setIsAIModalOpen(true)}
        onOpenBilling={() => setIsBillingModalOpen(true)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        user={user}
      />

      {/* Main Body */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* Left Sidebar */}
        <Sidebar
          projects={projects}
          activeProject={activeProject}
          onSelectProject={setActiveProject}
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          onOpenBilling={() => setIsBillingModalOpen(true)}
        />

        {/* Dynamic View Content */}
        <main style={{ flex: 1, overflowX: 'hidden' }}>
          {activeTab === 'kanban' && (
            <KanbanBoard
              tasks={filteredTasks}
              onUpdateTaskStatus={handleUpdateTaskStatus}
              onDeleteTask={handleDeleteTask}
              onEditTask={handleOpenEdit}
              onAddNewTaskWithStatus={handleAddNewTaskWithStatus}
            />
          )}

          {activeTab === 'list' && (
            <div style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>List View & Task Matrix</h2>
                <button
                  className="gradient-btn"
                  onClick={() => {
                    setEditingTask(null);
                    setDefaultTaskStatus('todo');
                    setIsTaskModalOpen(true);
                  }}
                >
                  Add Task
                </button>
              </div>

              <div className="glass-panel" style={{ padding: '1rem', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem' }}>Task</th>
                      <th style={{ padding: '0.75rem' }}>Status</th>
                      <th style={{ padding: '0.75rem' }}>Priority</th>
                      <th style={{ padding: '0.75rem' }}>Assignee</th>
                      <th style={{ padding: '0.75rem' }}>Due Date</th>
                      <th style={{ padding: '0.75rem' }}>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600 }}>{t.title}</td>
                        <td style={{ padding: '0.75rem', textTransform: 'capitalize' }}>{t.status.replace('_', ' ')}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span className={`badge badge-${t.priority}`}>{t.priority}</span>
                        </td>
                        <td style={{ padding: '0.75rem' }}>{t.assignee.name}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{t.dueDate}</td>
                        <td style={{ padding: '0.75rem' }}>{t.estimatedHours}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView tasks={tasks} projects={projects} activities={activities} />
          )}

          {activeTab === 'team' && <TeamView tasks={tasks} />}

          {activeTab === 'pomodoro' && <PomodoroTimer tasks={tasks} />}

          {activeTab === 'supabase' && <SupabaseSetupBanner />}
        </main>
      </div>

      {/* Modals */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSaveTask={handleSaveTask}
        initialTask={editingTask}
        defaultStatus={defaultTaskStatus}
      />

      <AIAssistantModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        tasks={tasks}
        onAutoAddAITasks={handleAutoAddAITasks}
      />

      <BillingModal
        isOpen={isBillingModalOpen}
        onClose={() => setIsBillingModalOpen(false)}
        user={user}
        onUpgradePlan={handleUpgradePlan}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={user}
        onLogin={setUser}
      />
    </div>
  );
}
