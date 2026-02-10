import { google, drive_v3 } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/server'

const DEAL_FLOW_FOLDER_NAME = 'Deal Flow Memos'

/**
 * Get redirect URI - computed at runtime to ensure env vars are loaded
 */
export function getRedirectUri(): string {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '').replace(/\/$/, '')

  // If VERCEL_URL is used, it doesn't include protocol
  const fullUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`

  return `${fullUrl}/api/integrations/google/callback`
}

/**
 * Alias for getRedirectUri for debugging purposes
 */
export function getDebugRedirectUri(): string {
  return getRedirectUri()
}

/**
 * Create OAuth2 client with credentials
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  )
}

/**
 * Generate OAuth URL for Google Drive authorization
 */
export function getGoogleDriveAuthUrl(userId: string): string {
  const oauth2Client = createOAuth2Client()

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive.file',
    ],
    prompt: 'consent', // Force to get refresh token
    state: userId, // Pass user ID as state for callback
  })
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = createOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

/**
 * Get Google Drive client with user's credentials
 */
export function getGoogleDriveClient(accessToken: string): drive_v3.Drive {
  const oauth2Client = createOAuth2Client()
  oauth2Client.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth: oauth2Client })
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const oauth2Client = createOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: refreshToken })

  const { credentials } = await oauth2Client.refreshAccessToken()
  return credentials.access_token!
}

/**
 * Ensure Deal Flow folder exists in user's Drive
 * Creates it if it doesn't exist
 */
export async function ensureDealFlowFolder(
  drive: drive_v3.Drive,
  existingFolderId?: string
): Promise<string> {
  // Check if we have a stored folder ID and it still exists
  if (existingFolderId) {
    try {
      const folder = await drive.files.get({
        fileId: existingFolderId,
        fields: 'id,name,trashed',
      })

      if (folder.data && !folder.data.trashed) {
        return existingFolderId
      }
    } catch {
      // Folder doesn't exist or is inaccessible, create a new one
    }
  }

  // Search for existing folder by name
  const searchResponse = await drive.files.list({
    q: `name='${DEAL_FLOW_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive',
  })

  if (searchResponse.data.files && searchResponse.data.files.length > 0) {
    return searchResponse.data.files[0].id!
  }

  // Create new folder
  const createResponse = await drive.files.create({
    requestBody: {
      name: DEAL_FLOW_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  })

  return createResponse.data.id!
}

/**
 * Convert memo content to HTML for Google Docs
 */
function memoToHtml(memo: {
  title: string
  content: string
  summary: string | null
  meetingDate: string | null
  companyName?: string | null
}): string {
  const date = memo.meetingDate
    ? new Date(memo.meetingDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Date not specified'

  // Convert markdown-like content to HTML
  const contentHtml = memo.content
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: 'Google Sans', Arial, sans-serif;
          line-height: 1.6;
          color: #202124;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 { color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; }
        h2 { color: #185abc; margin-top: 24px; }
        h3 { color: #3c4043; margin-top: 16px; }
        .meta { color: #5f6368; font-size: 14px; margin-bottom: 20px; }
        .summary { background: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 24px; border-left: 4px solid #1a73e8; }
        li { margin: 8px 0; }
        p { margin: 12px 0; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(memo.title)}</h1>
      <div class="meta">
        ${memo.companyName ? `<strong>Company:</strong> ${escapeHtml(memo.companyName)}<br>` : ''}
        <strong>Date:</strong> ${date}<br>
        <strong>Generated:</strong> ${new Date().toLocaleDateString()}
      </div>
      ${memo.summary ? `<div class="summary"><strong>Summary:</strong> ${escapeHtml(memo.summary)}</div>` : ''}
      <div class="content">
        <p>${contentHtml}</p>
      </div>
      <hr style="margin-top: 40px; border: none; border-top: 1px solid #dadce0;">
      <p style="color: #5f6368; font-size: 12px;">
        Generated by VC Meeting OS
      </p>
    </body>
    </html>
  `
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Create a Google Doc with memo content
 */
export async function createMemoDoc(
  drive: drive_v3.Drive,
  folderId: string,
  memo: {
    title: string
    content: string
    summary: string | null
    meetingDate: string | null
    companyName?: string | null
  }
): Promise<{ fileId: string; webViewLink: string }> {
  const htmlContent = memoToHtml(memo)

  // Create the document
  const response = await drive.files.create({
    requestBody: {
      name: memo.title,
      mimeType: 'application/vnd.google-apps.document',
      parents: [folderId],
    },
    media: {
      mimeType: 'text/html',
      body: htmlContent,
    },
    fields: 'id,webViewLink',
  })

  return {
    fileId: response.data.id!,
    webViewLink: response.data.webViewLink!,
  }
}

/**
 * Update an existing Google Doc with new content
 */
export async function updateMemoDoc(
  drive: drive_v3.Drive,
  fileId: string,
  memo: {
    title: string
    content: string
    summary: string | null
    meetingDate: string | null
    companyName?: string | null
  }
): Promise<{ fileId: string; webViewLink: string }> {
  const htmlContent = memoToHtml(memo)

  // Update the document content
  await drive.files.update({
    fileId,
    requestBody: {
      name: memo.title,
    },
    media: {
      mimeType: 'text/html',
      body: htmlContent,
    },
    fields: 'id,webViewLink',
  })

  // Get the web view link
  const fileResponse = await drive.files.get({
    fileId,
    fields: 'webViewLink',
  })

  return {
    fileId,
    webViewLink: fileResponse.data.webViewLink!,
  }
}

/**
 * Main function to create/update memo in Drive
 * Handles token refresh and folder creation
 */
export async function createMemoInDrive(
  accessToken: string,
  refreshToken: string | undefined,
  existingFolderId: string | undefined,
  userId: string,
  memo: {
    title: string
    content: string
    summary: string | null
    meetingDate: string | null
    companyName?: string | null
  },
  existingFileId?: string
): Promise<{
  fileId: string
  webViewLink: string
  folderId: string
} | null> {
  const adminClient = createAdminClient()
  let currentAccessToken = accessToken

  try {
    // Try to use the current access token
    let drive = getGoogleDriveClient(currentAccessToken)

    // Test if token is valid by making a simple request
    try {
      await drive.about.get({ fields: 'user' })
    } catch (error) {
      // Token might be expired, try to refresh
      if (refreshToken) {
        currentAccessToken = await refreshAccessToken(refreshToken)

        // Update the stored access token
        await (adminClient.from('integrations') as ReturnType<typeof adminClient.from>)
          .update({
            credentials: {
              access_token: currentAccessToken,
              refresh_token: refreshToken,
              drive_folder_id: existingFolderId,
            },
          } as never)
          .eq('user_id', userId)
          .eq('provider', 'google')

        drive = getGoogleDriveClient(currentAccessToken)
      } else {
        throw error
      }
    }

    // Ensure folder exists
    const folderId = await ensureDealFlowFolder(drive, existingFolderId)

    // Create or update the document
    let result: { fileId: string; webViewLink: string }

    if (existingFileId) {
      try {
        result = await updateMemoDoc(drive, existingFileId, memo)
      } catch {
        // File might have been deleted, create new one
        result = await createMemoDoc(drive, folderId, memo)
      }
    } else {
      result = await createMemoDoc(drive, folderId, memo)
    }

    return {
      ...result,
      folderId,
    }
  } catch (error) {
    console.error('Failed to create memo in Drive:', error)

    // Update integration status to error
    await (adminClient.from('integrations') as ReturnType<typeof adminClient.from>)
      .update({
        status: 'error',
        error_message: error instanceof Error ? error.message : 'Drive operation failed',
      } as never)
      .eq('user_id', userId)
      .eq('provider', 'google')

    return null
  }
}

/**
 * Delete a memo from Drive
 */
export async function deleteMemoFromDrive(
  accessToken: string,
  refreshToken: string | undefined,
  fileId: string
): Promise<boolean> {
  try {
    let currentAccessToken = accessToken

    try {
      const drive = getGoogleDriveClient(currentAccessToken)
      await drive.files.delete({ fileId })
      return true
    } catch {
      if (refreshToken) {
        currentAccessToken = await refreshAccessToken(refreshToken)
        const drive = getGoogleDriveClient(currentAccessToken)
        await drive.files.delete({ fileId })
        return true
      }
      return false
    }
  } catch (error) {
    console.error('Failed to delete memo from Drive:', error)
    return false
  }
}
