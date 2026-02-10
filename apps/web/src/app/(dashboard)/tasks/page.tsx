import { createClient } from '@/lib/supabase/server'
import { CheckSquare, AlertCircle, Clock, CheckCircle2 } from 'lucide-react'
import { TaskList } from './TaskList'
import { NewTaskButton } from './NewTaskButton'

interface SearchParams {
  status?: string
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const statusFilter = params.status || 'pending'

  // Fetch tasks
  let query = supabase
    .from('tasks')
    .select(`
      *,
      companies(id, name),
      memos(id, title)
    `)
    .eq('user_id', user!.id)

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  query = query.order('due_date', { ascending: true, nullsFirst: false })

  const { data: tasks, error } = await query

  // Get counts by status
  const { data: statusData } = await supabase
    .from('tasks')
    .select('status')
    .eq('user_id', user!.id)

  const counts = (statusData as Array<{ status: string }> | null)?.reduce(
    (acc, { status }) => {
      acc[status] = (acc[status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  ) || {}

  // Count overdue
  type TaskItem = { status: string; due_date: string | null }
  const overdueCount = (tasks as TaskItem[] | null)?.filter(
    (t) => t.status === 'pending' && t.due_date && new Date(t.due_date) < new Date()
  ).length || 0

  // Fetch companies for task creation
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('user_id', user!.id)
    .order('name')

  const statusTabs = [
    { value: 'pending', label: 'Pending', icon: Clock, count: counts.pending || 0 },
    { value: 'in_progress', label: 'In Progress', icon: AlertCircle, count: counts.in_progress || 0 },
    { value: 'completed', label: 'Completed', icon: CheckCircle2, count: counts.completed || 0 },
    { value: 'all', label: 'All', icon: CheckSquare, count: Object.values(counts).reduce((a, b) => a + b, 0) },
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-slate-400 mt-1">
            Track follow-ups and action items from your meetings
          </p>
        </div>
        <NewTaskButton companies={companies || []} />
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && statusFilter === 'pending' && (
        <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-red-300">
            You have <span className="font-semibold">{overdueCount}</span> overdue task
            {overdueCount !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {statusTabs.map((tab) => {
          const isActive = tab.value === statusFilter
          return (
            <a
              key={tab.value}
              href={`/tasks?status=${tab.value}`}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              <span className={`${isActive ? 'text-indigo-200' : 'text-slate-500'}`}>
                {tab.count}
              </span>
            </a>
          )
        })}
      </div>

      {/* Task list */}
      {error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-400">Error: {error.message}</p>
        </div>
      ) : tasks && tasks.length > 0 ? (
        <TaskList tasks={tasks} />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <CheckSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            {statusFilter === 'all' ? 'No tasks yet' : `No ${statusFilter.replace('_', ' ')} tasks`}
          </h3>
          <p className="text-slate-400 mb-6">
            Tasks are automatically extracted from your meeting memos
          </p>
          <NewTaskButton companies={companies || []} variant="primary" />
        </div>
      )}
    </div>
  )
}
