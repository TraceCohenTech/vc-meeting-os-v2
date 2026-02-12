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

interface ReminderDigestItem {
  id: string
  title: string
  type: string
  context?: string
  due_date?: string
  contact_name?: string
  company_name?: string
  is_overdue?: boolean
}

export function remindersDigestEmail(
  userName: string,
  reminders: ReminderDigestItem[],
  remindersUrl: string
) {
  const overdueCount = reminders.filter(r => r.is_overdue).length
  const subject = overdueCount > 0
    ? `${overdueCount} overdue reminder${overdueCount !== 1 ? 's' : ''} need your attention`
    : `Your daily reminders digest (${reminders.length} item${reminders.length !== 1 ? 's' : ''})`

  const typeEmoji: Record<string, string> = {
    commitment: '🤝',
    stale_relationship: '👥',
    follow_up: '📅',
    deadline: '⏰',
    intro_request: '🔗',
  }

  const remindersList = reminders.map(r => {
    const emoji = typeEmoji[r.type] || '🔔'
    const overdueTag = r.is_overdue ? '<span style="color: #ef4444; font-size: 11px; font-weight: 600;">[OVERDUE]</span> ' : ''
    const contextLine = r.contact_name || r.company_name
      ? `<br><span style="color: #64748b; font-size: 12px;">${r.contact_name ? r.contact_name : ''}${r.contact_name && r.company_name ? ' · ' : ''}${r.company_name ? r.company_name : ''}</span>`
      : ''
    return `
      <div style="background-color: #0f172a; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; border-left: 3px solid ${r.is_overdue ? '#ef4444' : '#6366f1'};">
        <p style="color: #f8fafc; margin: 0; font-size: 14px;">
          ${emoji} ${overdueTag}${r.title}
          ${contextLine}
        </p>
      </div>
    `
  }).join('')

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #e2e8f0; padding: 40px 20px;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155;">
          <h1 style="color: #f8fafc; font-size: 20px; margin: 0 0 8px 0;">Good morning, ${userName}!</h1>
          <p style="color: #94a3b8; margin: 0 0 24px 0; font-size: 14px;">
            ${overdueCount > 0
              ? `You have <span style="color: #ef4444; font-weight: 600;">${overdueCount} overdue</span> and ${reminders.length - overdueCount} upcoming reminders.`
              : `You have ${reminders.length} reminder${reminders.length !== 1 ? 's' : ''} to follow up on today.`
            }
          </p>

          ${remindersList}

          <a href="${remindersUrl}" style="display: inline-block; background-color: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 14px; margin-top: 16px;">View All Reminders</a>

          <p style="color: #64748b; font-size: 12px; margin-top: 32px; border-top: 1px solid #334155; padding-top: 16px;">
            You're receiving this daily digest because you enabled it in settings.
            <br><br>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings" style="color: #818cf8;">Manage notification preferences</a>
          </p>
        </div>
      </body>
    </html>
  `

  const textList = reminders.map(r => {
    const overdueTag = r.is_overdue ? '[OVERDUE] ' : ''
    return `- ${overdueTag}${r.title}${r.contact_name ? ` (${r.contact_name})` : ''}`
  }).join('\n')

  const text = `Good morning, ${userName}!\n\nYou have ${reminders.length} reminder(s):\n\n${textList}\n\nView reminders: ${remindersUrl}`

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
