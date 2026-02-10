import { generateText } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import {
  MEMO_TEMPLATES,
  getTemplateById,
  type MemoTemplate,
  type MeetingType,
} from './index'

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
})

/**
 * Detect the meeting type from transcript content
 * Uses keyword matching first, then AI classification for ambiguous cases
 */
export async function detectMeetingType(transcript: string): Promise<MeetingType> {
  // First pass: keyword matching
  const normalizedTranscript = transcript.toLowerCase()
  const scores: Record<string, number> = {}

  for (const template of MEMO_TEMPLATES) {
    let score = 0
    for (const keyword of template.detectionKeywords) {
      // Count occurrences of each keyword
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
      const matches = normalizedTranscript.match(regex)
      if (matches) {
        score += matches.length
      }
    }
    scores[template.id] = score
  }

  // Find the highest scoring template
  const maxScore = Math.max(...Object.values(scores))
  const topTemplates = Object.entries(scores)
    .filter(([, score]) => score === maxScore && score > 0)
    .map(([id]) => id)

  // If there's a clear winner with significant matches, use it
  if (topTemplates.length === 1 && maxScore >= 5) {
    return topTemplates[0] as MeetingType
  }

  // If unclear, use AI classification
  return await classifyWithAI(transcript)
}

/**
 * Use AI to classify the meeting type
 */
async function classifyWithAI(transcript: string): Promise<MeetingType> {
  const templateDescriptions = MEMO_TEMPLATES.map(
    t => `- ${t.id}: ${t.description}`
  ).join('\n')

  try {
    const response = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt: `Classify this meeting transcript into one of the following categories:

${templateDescriptions}

Return ONLY the category ID (e.g., "founder-pitch", "customer-call", etc.).
If unsure, return "internal".

Transcript excerpt:
${transcript.slice(0, 2000)}`,
    })

    const classification = response.text.trim().toLowerCase()

    // Validate the classification
    if (MEMO_TEMPLATES.find(t => t.id === classification)) {
      return classification as MeetingType
    }

    // Check for partial matches
    for (const template of MEMO_TEMPLATES) {
      if (classification.includes(template.id)) {
        return template.id as MeetingType
      }
    }

    return 'internal'
  } catch (error) {
    console.error('AI classification failed:', error)
    return 'internal'
  }
}

/**
 * Get the memo template for a detected meeting type
 */
export function getMemoTemplate(meetingType: MeetingType): MemoTemplate {
  return getTemplateById(meetingType)
}

/**
 * Generate a memo using the specified template
 */
export async function generateMemoFromTemplate(
  transcript: string,
  template: MemoTemplate
): Promise<string> {
  const sections: string[] = []

  // Generate content for each section
  for (const section of template.sections) {
    try {
      const response = await generateText({
        model: groq('llama-3.3-70b-versatile'),
        system: template.systemPrompt,
        prompt: `From the following meeting transcript, ${section.prompt}

If the information is not available or not discussed, indicate "Not discussed in meeting."

Transcript:
${transcript.slice(0, 5000)}`,
      })

      const content = response.text.trim()

      // Only include sections that have meaningful content
      if (content && !content.toLowerCase().includes('not discussed in meeting') || section.required) {
        sections.push(`## ${section.title}\n\n${content}`)
      }
    } catch (error) {
      console.error(`Failed to generate section ${section.id}:`, error)
      if (section.required) {
        sections.push(`## ${section.title}\n\n*Unable to extract from transcript*`)
      }
    }
  }

  return sections.join('\n\n---\n\n')
}

/**
 * Generate a quick summary without full template processing
 * Useful for preview or when speed is more important than detail
 */
export async function generateQuickSummary(transcript: string): Promise<string> {
  const response = await generateText({
    model: groq('llama-3.3-70b-versatile'),
    prompt: `Provide a brief 2-3 sentence summary of this meeting:

${transcript.slice(0, 3000)}`,
  })

  return response.text.trim()
}

/**
 * Re-generate a specific section of a memo
 * Useful for user-requested regeneration of individual sections
 */
export async function regenerateSection(
  transcript: string,
  template: MemoTemplate,
  sectionId: string
): Promise<string> {
  const section = template.sections.find(s => s.id === sectionId)

  if (!section) {
    throw new Error(`Section ${sectionId} not found in template ${template.id}`)
  }

  const response = await generateText({
    model: groq('llama-3.3-70b-versatile'),
    system: template.systemPrompt,
    prompt: `From the following meeting transcript, ${section.prompt}

Be thorough and extract all relevant details.

Transcript:
${transcript.slice(0, 5000)}`,
  })

  return response.text.trim()
}

/**
 * Validate that a template has all required sections filled
 */
export function validateMemoContent(
  content: string,
  template: MemoTemplate
): { valid: boolean; missingSections: string[] } {
  const missingSections: string[] = []

  for (const section of template.sections) {
    if (section.required) {
      // Check if the section header exists in the content
      if (!content.includes(`## ${section.title}`)) {
        missingSections.push(section.title)
      }
    }
  }

  return {
    valid: missingSections.length === 0,
    missingSections,
  }
}

/**
 * Extract structured data from generated memo content
 * Returns key-value pairs for database storage
 */
export function extractStructuredData(
  content: string,
  template: MemoTemplate
): Record<string, string> {
  const data: Record<string, string> = {}

  for (const section of template.sections) {
    const headerPattern = new RegExp(`## ${section.title}\\n\\n([\\s\\S]*?)(?=\\n\\n---\\n\\n|$)`, 'i')
    const match = content.match(headerPattern)

    if (match && match[1]) {
      data[section.id] = match[1].trim()
    }
  }

  return data
}
