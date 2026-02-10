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
  meetingType?: string | null
}): string {
  const date = memo.meetingDate
    ? new Date(memo.meetingDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Date not specified'

  // Format meeting type for display
  const meetingTypeDisplay = memo.meetingType
    ? memo.meetingType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : null

  // Convert markdown to properly formatted HTML
  const contentHtml = convertMarkdownToHtml(memo.content)

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #333;
      max-width: 700px;
      margin: 0;
      padding: 0;
    }
    h1 {
      font-size: 18pt;
      color: #1a73e8;
      border-bottom: 2px solid #1a73e8;
      padding-bottom: 8px;
      margin-top: 0;
      margin-bottom: 16px;
    }
    h2 {
      font-size: 14pt;
      color: #185abc;
      margin-top: 24px;
      margin-bottom: 8px;
      border-bottom: 1px solid #e0e0e0;
      padding-bottom: 4px;
    }
    h3 {
      font-size: 12pt;
      color: #3c4043;
      margin-top: 16px;
      margin-bottom: 6px;
    }
    .header-meta {
      background-color: #f8f9fa;
      padding: 12px 16px;
      margin-bottom: 20px;
      border-left: 4px solid #1a73e8;
    }
    .header-meta p {
      margin: 4px 0;
      font-size: 10pt;
      color: #5f6368;
    }
    .header-meta strong {
      color: #333;
    }
    .summary-box {
      background-color: #e8f0fe;
      padding: 12px 16px;
      margin-bottom: 24px;
      border-radius: 4px;
    }
    .summary-box p {
      margin: 0;
      font-style: italic;
    }
    ul {
      margin: 8px 0;
      padding-left: 24px;
    }
    li {
      margin: 6px 0;
    }
    p {
      margin: 10px 0;
    }
    .section {
      margin-bottom: 20px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #dadce0;
      font-size: 9pt;
      color: #9aa0a6;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(memo.title)}</h1>

  <div class="header-meta">
    ${memo.companyName ? `<p><strong>Company:</strong> ${escapeHtml(memo.companyName)}</p>` : ''}
    <p><strong>Meeting Date:</strong> ${date}</p>
    ${meetingTypeDisplay ? `<p><strong>Meeting Type:</strong> ${meetingTypeDisplay}</p>` : ''}
    <p><strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
  </div>

  ${memo.summary ? `
  <div class="summary-box">
    <p><strong>Executive Summary:</strong> ${escapeHtml(memo.summary)}</p>
  </div>
  ` : ''}

  <div class="content">
    ${contentHtml}
  </div>

  <div class="footer">
    Generated by VC Meeting OS • ai-vc-v2.vercel.app
  </div>
</body>
</html>`
}

/**
 * Convert markdown content to clean HTML
 */
function convertMarkdownToHtml(markdown: string): string {
  const lines = markdown.split('\n')
  let html = ''
  let inList = false
  let currentParagraph = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Skip empty lines
    if (!line) {
      if (currentParagraph) {
        html += `<p>${currentParagraph}</p>\n`
        currentParagraph = ''
      }
      if (inList) {
        html += '</ul>\n'
        inList = false
      }
      continue
    }

    // Headers
    if (line.startsWith('## ')) {
      if (currentParagraph) {
        html += `<p>${currentParagraph}</p>\n`
        currentParagraph = ''
      }
      if (inList) {
        html += '</ul>\n'
        inList = false
      }
      html += `<h2>${formatInlineMarkdown(line.slice(3))}</h2>\n`
      continue
    }
    if (line.startsWith('### ')) {
      if (currentParagraph) {
        html += `<p>${currentParagraph}</p>\n`
        currentParagraph = ''
      }
      if (inList) {
        html += '</ul>\n'
        inList = false
      }
      html += `<h3>${formatInlineMarkdown(line.slice(4))}</h3>\n`
      continue
    }

    // List items
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (currentParagraph) {
        html += `<p>${currentParagraph}</p>\n`
        currentParagraph = ''
      }
      if (!inList) {
        html += '<ul>\n'
        inList = true
      }
      html += `  <li>${formatInlineMarkdown(line.slice(2))}</li>\n`
      continue
    }

    // Regular paragraph text
    if (inList) {
      html += '</ul>\n'
      inList = false
    }
    if (currentParagraph) {
      currentParagraph += ' ' + formatInlineMarkdown(line)
    } else {
      currentParagraph = formatInlineMarkdown(line)
    }
  }

  // Close any remaining elements
  if (currentParagraph) {
    html += `<p>${currentParagraph}</p>\n`
  }
  if (inList) {
    html += '</ul>\n'
  }

  return html
}

/**
 * Format inline markdown (bold, italic)
 */
function formatInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
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
    meetingType?: string | null
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
    meetingType?: string | null
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
    meetingType?: string | null
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
