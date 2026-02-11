'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface NewContactButtonProps {
  variant?: 'default' | 'primary'
  companies: Array<{ id: string; name: string }>
}

export function NewContactButton({ variant = 'default', companies }: NewContactButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    title: '',
    phone: '',
    linkedin_url: '',
    company_id: '',
    new_company_name: '',
    notes: '',
    last_met_date: '',
  })
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      let companyId = formData.company_id

      // Create new company if specified
      if (formData.company_id === 'new' && formData.new_company_name.trim()) {
        const { data: newCompany, error: companyError } = await (supabase
          .from('companies') as ReturnType<typeof supabase.from>)
          .insert({
            user_id: user!.id,
            name: formData.new_company_name.trim(),
            status: 'tracking',
          })
          .select('id')
          .single()

        if (companyError) {
          console.error('Error creating company:', companyError)
          throw new Error('Failed to create company')
        }

        companyId = newCompany.id
      }

      const insertData: Record<string, unknown> = {
        user_id: user!.id,
        name: formData.name,
      }

      // Only add optional fields if they have values
      if (formData.email) insertData.email = formData.email
      if (formData.title) insertData.title = formData.title
      if (formData.phone) insertData.phone = formData.phone
      if (formData.linkedin_url) insertData.linkedin_url = formData.linkedin_url
      if (companyId && companyId !== 'new') insertData.company_id = companyId
      if (formData.notes) insertData.notes = formData.notes
      if (formData.last_met_date) insertData.last_met_date = formData.last_met_date

      const { error } = await (supabase.from('contacts') as ReturnType<typeof supabase.from>).insert(insertData)

      if (error) throw error

      setIsOpen(false)
      setFormData({
        name: '',
        email: '',
        title: '',
        phone: '',
        linkedin_url: '',
        company_id: '',
        new_company_name: '',
        notes: '',
        last_met_date: '',
      })
      router.refresh()
    } catch (err) {
      console.error('Error creating contact:', err)
      alert('Failed to create contact')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={
          variant === 'primary'
            ? 'px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center gap-2'
            : 'px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium flex items-center gap-2'
        }
      >
        <Plus className="w-4 h-4" />
        Add Contact
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-white">Add New Contact</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Name (required) */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="John Smith"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="john@company.com"
                />
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Title / Role
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="CEO, Founder, etc."
                />
              </div>

              {/* Company */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Company
                </label>
                <select
                  value={formData.company_id}
                  onChange={(e) => setFormData({ ...formData, company_id: e.target.value, new_company_name: '' })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">No company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                  <option value="new">+ Add new company</option>
                </select>

                {/* New company name input */}
                {formData.company_id === 'new' && (
                  <input
                    type="text"
                    value={formData.new_company_name}
                    onChange={(e) => setFormData({ ...formData, new_company_name: e.target.value })}
                    className="w-full mt-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter company name"
                    autoFocus
                  />
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              {/* LinkedIn */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  LinkedIn URL
                </label>
                <input
                  type="url"
                  value={formData.linkedin_url}
                  onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="https://linkedin.com/in/username"
                />
              </div>

              {/* Last Met Date */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Last Met
                </label>
                <input
                  type="date"
                  value={formData.last_met_date}
                  onChange={(e) => setFormData({ ...formData, last_met_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="What did you discuss? Any key takeaways?"
                />
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !formData.name || (formData.company_id === 'new' && !formData.new_company_name.trim())}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
