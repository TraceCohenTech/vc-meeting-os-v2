import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  if (!resend) {
    console.log('[Email] Resend not configured, skipping email:', options.subject)
    return false
  }

  try {
    await resend.emails.send({
      from: 'Deal Flow OS <notifications@dealflowos.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    })
    return true
  } catch (error) {
    console.error('[Email] Failed to send:', error)
    return false
  }
}

// Email templates
export function memoProcessedEmail(memoTitle: string, companyName: string | null, memoUrl: string) {
  const subject = companyName
    ? `New memo ready: ${companyName}`
    : `New memo ready: ${memoTitle}`

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #e2e8f0; padding: 40px 20px;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155;">
          <h1 style="color: #f8fafc; font-size: 20px; margin: 0 0 8px 0;">New Memo Ready</h1>
          <p style="color: #94a3b8; margin: 0 0 24px 0; font-size: 14px;">Your meeting has been processed</p>

          <div style="background-color: #0f172a; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="color: #f8fafc; font-weight: 600; margin: 0 0 4px 0;">${memoTitle}</p>
            ${companyName ? `<p style="color: #818cf8; margin: 0; font-size: 14px;">${companyName}</p>` : ''}
          </div>

          <a href="${memoUrl}" style="display: inline-block; background-color: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">View Memo</a>

          <p style="color: #64748b; font-size: 12px; margin-top: 32px; border-top: 1px solid #334155; padding-top: 16px;">
            You're receiving this because you have email notifications enabled in Deal Flow OS.
            <br><br>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings" style="color: #818cf8;">Manage notification preferences</a>
          </p>
        </div>
      </body>
    </html>
  `

  const text = `New Memo Ready: ${memoTitle}${companyName ? ` (${companyName})` : ''}\n\nView memo: ${memoUrl}`

  return { subject, html, text }
}

export function welcomeEmail(userName: string) {
  const subject = 'Welcome to Deal Flow OS'

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #e2e8f0; padding: 40px 20px;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155;">
          <h1 style="color: #f8fafc; font-size: 24px; margin: 0 0 16px 0;">Welcome to Deal Flow OS!</h1>

          <p style="color: #94a3b8; margin: 0 0 24px 0; line-height: 1.6;">
            Hi ${userName},<br><br>
            Thanks for signing up! Deal Flow OS turns your meeting recordings into structured investment memos automatically.
          </p>

          <div style="background-color: #0f172a; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <p style="color: #f8fafc; font-weight: 600; margin: 0 0 12px 0;">Get started in 3 steps:</p>
            <ol style="color: #94a3b8; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Connect your Fireflies.ai account</li>
              <li>Set up the webhook for automatic imports</li>
              <li>Have a meeting - memo appears automatically!</li>
            </ol>
          </div>

          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display: inline-block; background-color: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">Go to Dashboard</a>

          <p style="color: #64748b; font-size: 12px; margin-top: 32px; border-top: 1px solid #334155; padding-top: 16px;">
            Questions? Just reply to this email or send feedback from within the app.
          </p>
        </div>
      </body>
    </html>
  `

  return { subject, html }
}
