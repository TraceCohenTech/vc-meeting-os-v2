import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy | VC Meeting OS',
  description: 'Privacy Policy for VC Meeting OS',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-950 py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="text-indigo-400 hover:text-indigo-300 text-sm mb-8 inline-block"
        >
          ← Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-slate-400 mb-8">Last updated: February 9, 2025</p>

        <div className="prose prose-invert prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">1. Introduction</h2>
            <p className="text-slate-300 mb-4">
              VC Meeting OS (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy.
              This Privacy Policy explains how we collect, use, disclose, and safeguard your information
              when you use our meeting memo generation and management service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">2. Information We Collect</h2>

            <h3 className="text-lg font-medium text-white mb-2">2.1 Information You Provide</h3>
            <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
              <li>Account information (email address, name)</li>
              <li>Meeting transcripts and recordings you upload or connect via integrations</li>
              <li>Notes, memos, and other content you create</li>
              <li>Company and contact information you add</li>
            </ul>

            <h3 className="text-lg font-medium text-white mb-2">2.2 Information from Third-Party Services</h3>
            <p className="text-slate-300 mb-4">
              When you connect third-party services, we may receive:
            </p>
            <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
              <li><strong>Fireflies.ai:</strong> Meeting transcripts, participant names, meeting titles, and dates</li>
              <li><strong>Google Drive:</strong> Access to create and manage files in a dedicated folder for your memos</li>
              <li><strong>Granola:</strong> Meeting notes and transcripts</li>
            </ul>

            <h3 className="text-lg font-medium text-white mb-2">2.3 Automatically Collected Information</h3>
            <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
              <li>Usage data and analytics</li>
              <li>Device and browser information</li>
              <li>IP address and general location</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">3. How We Use Your Information</h2>
            <p className="text-slate-300 mb-4">We use collected information to:</p>
            <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
              <li>Process meeting transcripts and generate memos using AI</li>
              <li>Store and organize your meeting notes and company information</li>
              <li>Sync memos to your connected Google Drive</li>
              <li>Improve our services and user experience</li>
              <li>Communicate with you about your account and service updates</li>
              <li>Ensure security and prevent fraud</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">4. Data Processing and AI</h2>
            <p className="text-slate-300 mb-4">
              We use third-party AI services (including Groq) to process your meeting transcripts
              and generate memos. Your transcript content is sent to these services for processing.
              We do not use your data to train AI models.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">5. Data Sharing and Disclosure</h2>
            <p className="text-slate-300 mb-4">We do not sell your personal information. We may share data with:</p>
            <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
              <li><strong>Service Providers:</strong> Third-party services that help us operate (hosting, AI processing, authentication)</li>
              <li><strong>Connected Services:</strong> Services you explicitly connect (Google Drive, Fireflies)</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">6. Data Security</h2>
            <p className="text-slate-300 mb-4">
              We implement appropriate technical and organizational measures to protect your data,
              including encryption in transit and at rest, secure authentication, and regular security reviews.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">7. Data Retention</h2>
            <p className="text-slate-300 mb-4">
              We retain your data for as long as your account is active or as needed to provide services.
              You can delete your memos and data at any time. Upon account deletion, we will remove your
              data within 30 days, except as required by law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">8. Your Rights</h2>
            <p className="text-slate-300 mb-4">You have the right to:</p>
            <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your data</li>
              <li>Export your data</li>
              <li>Revoke third-party service connections</li>
              <li>Opt out of non-essential communications</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">9. Third-Party Services</h2>
            <p className="text-slate-300 mb-4">
              Our service integrates with third-party services. Each has their own privacy policy:
            </p>
            <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
              <li>Google Drive: <a href="https://policies.google.com/privacy" className="text-indigo-400 hover:text-indigo-300">Google Privacy Policy</a></li>
              <li>Fireflies.ai: <a href="https://fireflies.ai/privacy" className="text-indigo-400 hover:text-indigo-300">Fireflies Privacy Policy</a></li>
              <li>Supabase (Authentication/Database): <a href="https://supabase.com/privacy" className="text-indigo-400 hover:text-indigo-300">Supabase Privacy Policy</a></li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">10. Google API Services User Data Policy</h2>
            <p className="text-slate-300 mb-4">
              Our use and transfer of information received from Google APIs adheres to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className="text-indigo-400 hover:text-indigo-300"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>, including the Limited Use requirements.
            </p>
            <p className="text-slate-300 mb-4">
              We only request access to Google Drive with the limited scope needed to create and
              manage memo files in a dedicated folder. We do not access other files in your Drive.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">11. Changes to This Policy</h2>
            <p className="text-slate-300 mb-4">
              We may update this Privacy Policy from time to time. We will notify you of significant
              changes by email or through the service. Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">12. Contact Us</h2>
            <p className="text-slate-300 mb-4">
              If you have questions about this Privacy Policy or our data practices, please contact us at:
            </p>
            <p className="text-slate-300">
              Email: privacy@vcmeetingos.com
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
