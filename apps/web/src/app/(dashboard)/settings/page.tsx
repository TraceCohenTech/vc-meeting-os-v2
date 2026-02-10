import { createClient } from '@/lib/supabase/server'
import { SettingsForm } from './SettingsForm'
import { IntegrationsSection } from './IntegrationsSection'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  // Fetch integrations
  const { data: integrations } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', user!.id)

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">
          Manage your account and integrations
        </p>
      </div>

      <div className="space-y-8">
        {/* Profile Section */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6">Profile</h2>
          <SettingsForm profile={profile} userEmail={user!.email || ''} />
        </section>

        {/* Integrations Section */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Integrations</h2>
          <p className="text-slate-400 text-sm mb-6">
            Connect your transcript sources to automatically import meetings
          </p>
          <IntegrationsSection integrations={integrations || []} />
        </section>

        {/* Notification Preferences */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6">Notifications</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Email Digest Frequency
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Receive a summary of your meetings, tasks, and pipeline updates
              </p>
              <DigestFrequencySelect
                currentValue={(profile as { digest_frequency?: string } | null)?.digest_frequency || 'weekly'}
                userId={user!.id}
              />
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="bg-slate-900 border border-red-500/20 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h2>
          <p className="text-slate-400 text-sm mb-4">
            Irreversible and destructive actions
          </p>
          <button
            className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors"
          >
            Delete Account
          </button>
        </section>
      </div>
    </div>
  )
}

// Client component for digest frequency
import { DigestFrequencySelect } from './DigestFrequencySelect'
