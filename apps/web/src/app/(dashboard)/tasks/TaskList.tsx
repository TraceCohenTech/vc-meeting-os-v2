'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  Circle,
  Calendar,
  Building2,
  FileText,
  MoreVertical,
  Trash2,
  Play,
  RotateCcw,
} from 'lucide-react'
import type { Task } from '@/lib/supabase/types'

interface TaskWithRelations extends Task {
  companies: { id: string; name: string } | null
  memos: { id: string; title: string } | null
}

interface TaskListProps {
  tasks: TaskWithRelations[]
}

const priorityColors = {
  low: 'text-slate-400',
  medium: 'text-amber-400',
  high: 'text-red-400',
}

const priorityBg = {
  low: 'bg-slate-500/20',
  medium: 'bg-amber-500/20',
  high: 'bg-red-500/20',
}

export function TaskList({ tasks }: TaskListProps) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const updateTaskStatus = async (taskId: string, status: 'pending' | 'in_progress' | 'completed') => {
    setLoadingId(taskId)
    const supabase = createClient()

    await (supabase.from('tasks') as ReturnType<typeof supabase.from>)
      .update({ status } as never)
      .eq('id', taskId)

    setLoadingId(null)
    router.refresh()
  }

  const deleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return

    setLoadingId(taskId)
    const supabase = createClient()

    await supabase.from('tasks').delete().eq('id', taskId)

    setLoadingId(null)
    setMenuOpenId(null)
    router.refresh()
  }

  const isOverdue = (task: TaskWithRelations) => {
    return task.status === 'pending' && task.due_date && new Date(task.due_date) < new Date()
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const overdue = isOverdue(task)

        return (
          <div
            key={task.id}
            className={`bg-slate-900 border rounded-xl p-4 transition-colors ${
              overdue ? 'border-red-500/30' : 'border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Status toggle */}
              <button
                onClick={() =>
                  updateTaskStatus(
                    task.id,
                    task.status === 'completed' ? 'pending' : 'completed'
                  )
                }
                disabled={loadingId === task.id}
                className="mt-0.5 flex-shrink-0"
              >
                {loadingId === task.id ? (
                  <div className="w-5 h-5 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
                ) : task.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Circle className={`w-5 h-5 ${overdue ? 'text-red-400' : 'text-slate-500'} hover:text-indigo-400`} />
                )}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3
                      className={`font-medium ${
                        task.status === 'completed'
                          ? 'text-slate-500 line-through'
                          : 'text-white'
                      }`}
                    >
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-sm text-slate-400 mt-1">{task.description}</p>
                    )}
                  </div>

                  {/* Menu */}
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpenId(menuOpenId === task.id ? null : task.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {menuOpenId === task.id && (
                      <div className="absolute right-0 top-full mt-1 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 py-1">
                        {task.status === 'pending' && (
                          <button
                            onClick={() => {
                              updateTaskStatus(task.id, 'in_progress')
                              setMenuOpenId(null)
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                          >
                            <Play className="w-4 h-4" />
                            Start Progress
                          </button>
                        )}
                        {task.status === 'in_progress' && (
                          <button
                            onClick={() => {
                              updateTaskStatus(task.id, 'pending')
                              setMenuOpenId(null)
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Move to Pending
                          </button>
                        )}
                        {task.status === 'completed' && (
                          <button
                            onClick={() => {
                              updateTaskStatus(task.id, 'pending')
                              setMenuOpenId(null)
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Reopen
                          </button>
                        )}
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-slate-700"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Meta */}
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  {/* Priority */}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityBg[task.priority]} ${priorityColors[task.priority]}`}
                  >
                    {task.priority}
                  </span>

                  {/* Due date */}
                  {task.due_date && (
                    <div
                      className={`flex items-center gap-1.5 text-sm ${
                        overdue ? 'text-red-400' : 'text-slate-500'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      {overdue ? 'Overdue: ' : ''}
                      {new Date(task.due_date).toLocaleDateString()}
                    </div>
                  )}

                  {/* Company */}
                  {task.companies && (
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Building2 className="w-3.5 h-3.5" />
                      {task.companies.name}
                    </div>
                  )}

                  {/* Memo */}
                  {task.memos && (
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <FileText className="w-3.5 h-3.5" />
                      {task.memos.title}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
