'use client'

import Link from 'next/link'
import { Mail, Building2, Calendar, MessageSquare, Linkedin, Phone } from 'lucide-react'

interface PersonCardProps {
  contact: {
    id: string
    name: string
    email: string | null
    title: string | null
    phone: string | null
    linkedin_url: string | null
    company_id: string | null
    notes: string | null
    last_met_date: string | null
    met_via: string | null
    companies: { id: string; name: string } | null
  }
  meetingCount: number
}

export function PersonCard({ contact, meetingCount }: PersonCardProps) {
  const initials = contact.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return date.toLocaleDateString()
  }

  return (
    <Link
      href={`/people/${contact.id}`}
      className="block bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors"
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-semibold">{initials}</span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Name & Title */}
          <h3 className="text-white font-semibold truncate">{contact.name}</h3>
          {contact.title && (
            <p className="text-slate-400 text-sm truncate">{contact.title}</p>
          )}

          {/* Company */}
          {contact.companies && (
            <div className="flex items-center gap-1.5 mt-2 text-sm text-slate-400">
              <Building2 className="w-3.5 h-3.5" />
              <span className="truncate">{contact.companies.name}</span>
            </div>
          )}

          {/* Email */}
          {contact.email && (
            <div className="flex items-center gap-1.5 mt-1 text-sm text-slate-500">
              <Mail className="w-3.5 h-3.5" />
              <span className="truncate">{contact.email}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-800">
        {contact.last_met_date && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formatDate(contact.last_met_date)}</span>
          </div>
        )}

        {meetingCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{meetingCount} meeting{meetingCount !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Quick action icons */}
        <div className="ml-auto flex items-center gap-2">
          {contact.linkedin_url && (
            <a
              href={contact.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-slate-500 hover:text-blue-400 transition-colors"
            >
              <Linkedin className="w-4 h-4" />
            </a>
          )}
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="text-slate-500 hover:text-emerald-400 transition-colors"
            >
              <Phone className="w-4 h-4" />
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              onClick={(e) => e.stopPropagation()}
              className="text-slate-500 hover:text-indigo-400 transition-colors"
            >
              <Mail className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {/* Notes preview */}
      {contact.notes && (
        <p className="mt-3 text-xs text-slate-500 line-clamp-2">{contact.notes}</p>
      )}
    </Link>
  )
}
