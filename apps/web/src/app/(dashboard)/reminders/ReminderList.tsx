'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2,
  Calendar,
  Building2,
  FileText,
  MoreVertical,
  Trash2,
  Clock,
  XCircle,
  RotateCcw,
  User,
  Handshake,
  Users,
  CalendarClock,
  UserPlus,
  MessageSquare,
  AlarmClock,
} from 'lucide-react'

interface Reminder {
  id: string
  type: string
  title: string
  context: string | null
  due_date: string | null
  snoozed_until: string | null
  status: string
  priority: string
  source_text: string | null
  created_at: string
  completed_at: string | null
  contact_id: string | null
  company_id: string | null
  memo_id: string | null
  contacts: { id: string; name: string; email: string | null } | null
  companies: { id: string; name: string } | null
  memos: { id: string; title: string } | null
}

interface ReminderListProps {
  reminders: Reminder[]
}

const typeIcons: Record<string, typeof Handshake> = {
  commitment: Handshake,
  stale_relationship: Users,
  follow_up: CalendarClock,
  deadline: Clock,
  intro_request: UserPlus,
}

const typeColors: Record<string, { bg: string; text: string }> = {
  commitment: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  stale_relationship: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  follow_up: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  deadline: { bg: 'bg-red-500/20', text: 'text-red-400' },
  intro_request: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
}

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-slate-500/20', text: 'text-slate-400' },
  medium: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  high: { bg: 'bg-red-500/20', text: 'text-red-400' },
}

export function ReminderList({ reminders }: ReminderListProps) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [snoozeMenuId, setSnoozeMenuId] = useState<string | null>(null)

  const updateReminder = async (reminderId: string, action: string, snoozeDays?: number) => {
    setLoadingId(reminderId)
    setMenuOpenId(null)
    setSnoozeMenuId(null)

    try {
      const response = await fetch(`/api/reminders/${reminderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, snooze_days: snoozeDays }),
      })

      if (!response.ok) {
        throw new Error('Failed to update reminder')
      }
    } catch (error) {
      console.error('Update error:', error)
    }

    setLoadingId(null)
    router.refresh()
  }

  const deleteReminder = async (reminderId: string) => {
    if (!confirm('Are you sure you want to delete this reminder?')) return

    setLoadingId(reminderId)
    setMenuOpenId(null)

    try {
      await fetch(`/api/reminders/${reminderId}`, { method: 'DELETE' })
    } catch (error) {
      console.error('Delete error:', error)
    }

    setLoadingId(null)
    router.refresh()
  }

  const isOverdue = (reminder: Reminder) => {
    return reminder.status === 'pending' && reminder.due_date && new Date(reminder.due_date) < new Date()
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
    return d.toLocaleDateString()
  }

  return (
    <div className="space-y-2">
      {reminders.map((reminder) => {
        const overdue = isOverdue(reminder)
        const TypeIcon = typeIcons[reminder.type] || Handshake
        const typeColor = typeColors[reminder.type] || typeColors.commitment
        const priorityColor = priorityColors[reminder.priority] || priorityColors.medium

        return (
          <div
            key={reminder.id}
            className={`bg-slate-900 border rounded-xl p-4 transition-colors ${
              overdue ? 'border-red-500/30' : 'border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Action button */}
              <button
                onClick={() => updateReminder(reminder.id, 'complete')}
                disabled={loadingId === reminder.id}
                className="mt-0.5 flex-shrink-0"
                title="Mark as complete"
              >
                {loadingId === reminder.id ? (
                  <div className="w-5 h-5 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
                ) : reminder.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <div className={`w-5 h-5 rounded-full border-2 ${
                    overdue ? 'border-red-400' : 'border-slate-500'
                  } hover:border-indigo-400 transition-colors`} />
                )}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3
                      className={`font-medium ${
                        reminder.status === 'completed'
                          ? 'text-slate-500 line-through'
                          : 'text-white'
                      }`}
                    >
                      {reminder.title}
                    </h3>
                    {reminder.context && (
                      <p className="text-sm text-slate-400 mt-1 line-clamp-2">{reminder.context}</p>
                    )}
                    {reminder.source_text && (
                      <div className="mt-2 flex items-start gap-2 text-xs text-slate-500 bg-slate-800/50 rounded-lg p-2">
                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span className="italic line-clamp-2">"{reminder.source_text}"</span>
                      </div>
                    )}
                  </div>

                  {/* Menu */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setMenuOpenId(menuOpenId === reminder.id ? null : reminder.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {menuOpenId === reminder.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 py-1">
                        {reminder.status === 'pending' && (
                          <>
                            <button
                              onClick={() => updateReminder(reminder.id, 'complete')}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              Mark Complete
                            </button>
                            <div className="relative">
                              <button
                                onClick={() => setSnoozeMenuId(snoozeMenuId === reminder.id ? null : reminder.id)}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                              >
                                <AlarmClock className="w-4 h-4 text-amber-400" />
                                Snooze...
                              </button>
                              {snoozeMenuId === reminder.id && (
                                <div className="absolute left-full top-0 ml-1 w-32 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1">
                                  {[1, 3, 7, 14, 30].map((days) => (
                                    <button
                                      key={days}
                                      onClick={() => updateReminder(reminder.id, 'snooze', days)}
                                      className="w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 text-left"
                                    >
                                      {days === 1 ? '1 day' : `${days} days`}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => updateReminder(reminder.id, 'dismiss')}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                            >
                              <XCircle className="w-4 h-4 text-slate-400" />
                              Dismiss
                            </button>
                          </>
                        )}
                        {(reminder.status === 'completed' || reminder.status === 'dismissed' || reminder.status === 'snoozed') && (
                          <button
                            onClick={() => updateReminder(reminder.id, 'reopen')}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Reopen
                          </button>
                        )}
                        <hr className="my-1 border-slate-700" />
                        <button
                          onClick={() => deleteReminder(reminder.id)}
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
                  {/* Type badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${typeColor.bg} ${typeColor.text}`}
                  >
                    <TypeIcon className="w-3 h-3" />
                    {reminder.type.replace('_', ' ')}
                  </span>

                  {/* Priority */}
                  {reminder.priority !== 'medium' && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor.bg} ${priorityColor.text}`}
                    >
                      {reminder.priority}
                    </span>
                  )}

                  {/* Due date */}
                  {reminder.due_date && (
                    <div
                      className={`flex items-center gap-1.5 text-sm ${
                        overdue ? 'text-red-400' : 'text-slate-500'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      {overdue ? 'Overdue: ' : ''}
                      {formatDate(reminder.due_date)}
                    </div>
                  )}

                  {/* Snoozed until */}
                  {reminder.snoozed_until && reminder.status === 'snoozed' && (
                    <div className="flex items-center gap-1.5 text-sm text-amber-400">
                      <AlarmClock className="w-3.5 h-3.5" />
                      Snoozed until {formatDate(reminder.snoozed_until)}
                    </div>
                  )}

                  {/* Contact */}
                  {reminder.contacts && (
                    <Link
                      href={`/people/${reminder.contacts.id}`}
                      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-400"
                    >
                      <User className="w-3.5 h-3.5" />
                      {reminder.contacts.name}
                    </Link>
                  )}

                  {/* Company */}
                  {reminder.companies && (
                    <Link
                      href={`/companies/${reminder.companies.id}`}
                      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-400"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      {reminder.companies.name}
                    </Link>
                  )}

                  {/* Memo */}
                  {reminder.memos && (
                    <Link
                      href={`/memos/${reminder.memo_id}`}
                      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-400"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {reminder.memos.title}
                    </Link>
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
