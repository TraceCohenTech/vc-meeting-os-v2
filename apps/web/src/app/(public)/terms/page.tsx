import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service | VC Meeting OS',
  description: 'Terms of Service for VC Meeting OS',
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-slate-950 py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="text-indigo-400 hover:text-indigo-300 text-sm mb-8 inline-block"
        >
          ← Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-slate-400 mb-8">Last updated: February 9, 2025</p>

        <div className="prose prose-invert prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
            <p className="text-slate-300 mb-4">
              By accessing or using VC Meeting OS (&quot;Service&quot;), you agree to be bound by these
              Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">2. Description of Service</h2>
            <p className="text-slate-300 mb-4">
              VC Meeting OS is a productivity tool designed for venture capital professionals to:
            </p>
            <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
              <li>Import and process meeting transcripts</li>
              <li>Generate AI-powered meeting memos</li>
              <li>Organize and manage deal flow information</li>
              <li>Track companies and action items</li>
              <li>Sync documents to Google Drive</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">3. Account Registration</h2>
            <p className="text-slate-300 mb-4">
              To use the Service, you must create an account. You agree to:
            </p>
            <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Notify us immediately of any unauthorized access</li>
              <li>Be responsible for all activities under your account</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">4. Acceptable Use</h2>
            <p className="text-slate-300 mb-4">You agree not to:</p>
            <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
              <li>Use the Service for any illegal purpose</li>
              <li>Upload malicious code or attempt to compromise the Service</li>
              <li>Violate the intellectual property rights of others</li>
              <li>Share your account with unauthorized users</li>
              <li>Attempt to reverse engineer or copy the Service</li>
              <li>Use the Service to process data you don&apos;t have rights to</li>
              <li>Exceed reasonable usage limits or abuse the Service</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">5. Your Content</h2>
            <p className="text-slate-300 mb-4">
              You retain ownership of all content you upload or create (&quot;Your Content&quot;).
              By using the Service, you grant us a limited license to process Your Content
              solely to provide the Service to you.
            </p>
            <p className="text-slate-300 mb-4">
              You are responsible for ensuring you have the right to upload and process
              any meeting transcripts, including obtaining necessary consents from meeting participants.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">6. Third-Party Integrations</h2>
            <p className="text-slate-300 mb-4">
              The Service integrates with third-party services (Fireflies.ai, Google Drive, etc.).
              Your use of these integrations is subject to their respective terms of service.
              We are not responsible for the availability or functionality of third-party services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">7. AI-Generated Content</h2>
            <p className="text-slate-300 mb-4">
              The Service uses artificial intelligence to generate memos and summaries.
              AI-generated content may contain errors or inaccuracies. You are responsible
              for reviewing and verifying all AI-generated content before relying on it
              for business decisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">8. Intellectual Property</h2>
            <p className="text-slate-300 mb-4">
              The Service, including its design, features, and technology, is owned by us
              and protected by intellectual property laws. You may not copy, modify, or
              distribute any part of the Service without permission.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">9. Privacy</h2>
            <p className="text-slate-300 mb-4">
              Your use of the Service is also governed by our{' '}
              <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300">
                Privacy Policy
              </Link>
              , which describes how we collect, use, and protect your information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">10. Service Availability</h2>
            <p className="text-slate-300 mb-4">
              We strive to maintain high availability but do not guarantee uninterrupted access.
              The Service may be temporarily unavailable for maintenance, updates, or due to
              circumstances beyond our control.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">11. Limitation of Liability</h2>
            <p className="text-slate-300 mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT
              WARRANTIES OF ANY KIND. WE ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
            </p>
            <p className="text-slate-300 mb-4">
              Our total liability for any claims related to the Service shall not exceed
              the amount you paid us in the twelve months preceding the claim.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">12. Indemnification</h2>
            <p className="text-slate-300 mb-4">
              You agree to indemnify and hold us harmless from any claims, damages, or expenses
              arising from your use of the Service, your violation of these Terms, or your
              violation of any rights of a third party.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">13. Termination</h2>
            <p className="text-slate-300 mb-4">
              You may stop using the Service at any time. We may suspend or terminate your
              access if you violate these Terms or for any other reason with notice. Upon
              termination, your right to use the Service ends, but provisions that should
              survive (such as limitation of liability) will remain in effect.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">14. Changes to Terms</h2>
            <p className="text-slate-300 mb-4">
              We may modify these Terms at any time. We will notify you of material changes
              via email or through the Service. Continued use after changes constitutes
              acceptance of the new Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">15. Governing Law</h2>
            <p className="text-slate-300 mb-4">
              These Terms are governed by the laws of the State of Delaware, United States,
              without regard to conflict of law principles. Any disputes shall be resolved
              in the courts of Delaware.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">16. Contact</h2>
            <p className="text-slate-300 mb-4">
              For questions about these Terms, please contact us at:
            </p>
            <p className="text-slate-300">
              Email: legal@vcmeetingos.com
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
