import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface CompanyDetection {
  name: string
  confidence: number  // 0-1
  existingCompanyId?: string
  metadata: {
    domain?: string
    website?: string
    stage?: string
    industry?: string
    founders?: Array<{ name: string; title?: string }>
    participants?: string[]
    mentioned_names?: string[]
  }
}

interface ExistingCompany {
  id: string
  name: string
  domain: string | null
  normalized_domain: string | null
}

/**
 * Normalize a company name for comparison
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(inc|llc|ltd|corp|corporation|company|co|incorporated)\.?$/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  if (s1 === s2) return 1

  const longer = s1.length > s2.length ? s1 : s2

  if (longer.length === 0) return 1

  // Levenshtein distance
  const costs: number[] = []
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j
      } else if (j > 0) {
        let newValue = costs[j - 1]
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
        }
        costs[j - 1] = lastValue
        lastValue = newValue
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue
    }
  }

  return (longer.length - costs[s2.length]) / longer.length
}

/**
 * Extract domain from a URL
 */
function extractDomain(url: string): string | null {
  try {
    // Add protocol if missing
    if (!url.startsWith('http')) {
      url = 'https://' + url
    }
    const urlObj = new URL(url)
    return urlObj.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Find matching company from existing companies
 */
function findMatchingCompany(
  detection: { name: string; domain?: string },
  existingCompanies: ExistingCompany[]
): { company: ExistingCompany | null; confidence: number } {
  let bestMatch: ExistingCompany | null = null
  let bestConfidence = 0

  const normalizedName = normalizeCompanyName(detection.name)

  for (const company of existingCompanies) {
    // Check exact domain match first (highest confidence)
    if (detection.domain && company.normalized_domain) {
      if (detection.domain === company.normalized_domain) {
        return { company, confidence: 1.0 }
      }
    }

    // Check name similarity
    const normalizedExistingName = normalizeCompanyName(company.name)
    const similarity = calculateSimilarity(normalizedName, normalizedExistingName)

    // Exact name match
    if (normalizedName === normalizedExistingName) {
      if (0.95 > bestConfidence) {
        bestMatch = company
        bestConfidence = 0.95
      }
    }
    // High similarity
    else if (similarity > 0.85 && similarity > bestConfidence) {
      bestMatch = company
      bestConfidence = similarity
    }
    // Check if one name contains the other
    else if (
      normalizedName.includes(normalizedExistingName) ||
      normalizedExistingName.includes(normalizedName)
    ) {
      const containmentConfidence = 0.8
      if (containmentConfidence > bestConfidence) {
        bestMatch = company
        bestConfidence = containmentConfidence
      }
    }
  }

  return { company: bestMatch, confidence: bestConfidence }
}

/**
 * Detect company from transcript content using AI
 */
export async function detectCompanyFromTranscript(
  transcript: string,
  existingCompanies: ExistingCompany[]
): Promise<CompanyDetection | null> {
  try {
    // Use AI to extract company information
    const extraction = await generateText({
      model: anthropic('claude-3-haiku-20240307'),
      prompt: `Analyze this meeting transcript and extract information about the PRIMARY company being discussed (if this is a pitch meeting, the company pitching; if a customer call, the customer's company; etc.).

If multiple companies are discussed, focus on the main subject of the meeting.

Return a JSON object with the following structure (use null for unknown fields):
{
  "company_name": "string or null",
  "website": "string or null",
  "domain": "string or null (just the domain like 'example.com')",
  "stage": "one of: idea, pre-seed, seed, series-a, series-b, series-c, growth, public, or null",
  "industry": "string or null",
  "founders": [{"name": "string", "title": "string or null"}],
  "confidence": "high, medium, or low",
  "mentioned_company_names": ["list of all company names mentioned"]
}

If no company is clearly the subject of the meeting, return {"company_name": null}.

Return ONLY valid JSON, no other text.

Transcript:
${transcript.slice(0, 4000)}`,
    })

    // Parse the AI response
    let parsed: {
      company_name: string | null
      website?: string
      domain?: string
      stage?: string
      industry?: string
      founders?: Array<{ name: string; title?: string }>
      confidence?: 'high' | 'medium' | 'low'
      mentioned_company_names?: string[]
    }

    try {
      // Try to extract JSON from the response
      const jsonMatch = extraction.text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return null
      }
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      console.error('Failed to parse company extraction:', extraction.text)
      return null
    }

    if (!parsed.company_name) {
      return null
    }

    // Normalize the domain if website was provided
    let domain = parsed.domain
    if (!domain && parsed.website) {
      domain = extractDomain(parsed.website) || undefined
    }

    // Try to match with existing companies
    const { company: matchedCompany, confidence: matchConfidence } = findMatchingCompany(
      { name: parsed.company_name, domain },
      existingCompanies
    )

    // Calculate final confidence
    let confidence: number
    if (parsed.confidence === 'high') {
      confidence = matchedCompany ? Math.max(matchConfidence, 0.9) : 0.85
    } else if (parsed.confidence === 'medium') {
      confidence = matchedCompany ? Math.max(matchConfidence, 0.75) : 0.7
    } else {
      confidence = matchedCompany ? Math.max(matchConfidence, 0.6) : 0.5
    }

    return {
      name: parsed.company_name,
      confidence,
      existingCompanyId: matchedCompany?.id,
      metadata: {
        domain,
        website: parsed.website,
        stage: parsed.stage,
        industry: parsed.industry,
        founders: parsed.founders,
        mentioned_names: parsed.mentioned_company_names,
      },
    }
  } catch (error) {
    console.error('Company detection failed:', error)
    return null
  }
}

/**
 * Extract participant emails and names from transcript
 * Useful for matching companies via email domains
 */
export function extractParticipantInfo(
  transcript: string
): { names: string[]; emails: string[]; domains: string[] } {
  const names: Set<string> = new Set()
  const emails: Set<string> = new Set()
  const domains: Set<string> = new Set()

  // Extract emails
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g
  const emailMatches = transcript.match(emailRegex) || []
  for (const email of emailMatches) {
    emails.add(email.toLowerCase())
    const domain = email.split('@')[1]
    // Filter out common email providers
    if (!['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'].includes(domain)) {
      domains.add(domain)
    }
  }

  // Extract names from speaker labels (common in transcript formats)
  const speakerRegex = /^([A-Z][a-z]+ [A-Z][a-z]+):/gm
  const speakerMatches = Array.from(transcript.matchAll(speakerRegex))
  for (const match of speakerMatches) {
    names.add(match[1])
  }

  return {
    names: Array.from(names),
    emails: Array.from(emails),
    domains: Array.from(domains),
  }
}

/**
 * Merge duplicate companies (returns the ID to keep)
 */
export function suggestCompanyMerge(
  companies: ExistingCompany[]
): Array<{ primary: string; duplicates: string[]; confidence: number }> {
  const merges: Array<{ primary: string; duplicates: string[]; confidence: number }> = []
  const processed = new Set<string>()

  for (let i = 0; i < companies.length; i++) {
    if (processed.has(companies[i].id)) continue

    const duplicates: string[] = []
    let maxConfidence = 0

    for (let j = i + 1; j < companies.length; j++) {
      if (processed.has(companies[j].id)) continue

      // Check domain match
      if (
        companies[i].normalized_domain &&
        companies[j].normalized_domain &&
        companies[i].normalized_domain === companies[j].normalized_domain
      ) {
        duplicates.push(companies[j].id)
        processed.add(companies[j].id)
        maxConfidence = Math.max(maxConfidence, 0.95)
        continue
      }

      // Check name similarity
      const similarity = calculateSimilarity(
        normalizeCompanyName(companies[i].name),
        normalizeCompanyName(companies[j].name)
      )

      if (similarity > 0.85) {
        duplicates.push(companies[j].id)
        processed.add(companies[j].id)
        maxConfidence = Math.max(maxConfidence, similarity)
      }
    }

    if (duplicates.length > 0) {
      merges.push({
        primary: companies[i].id,
        duplicates,
        confidence: maxConfidence,
      })
    }
  }

  return merges
}
