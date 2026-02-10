/**
 * Memo Templates
 *
 * Templates define the structure and AI prompts for different meeting types.
 * Each template has sections with specific extraction prompts to generate
 * relevant content for that meeting type.
 */

export interface TemplateSection {
  id: string
  title: string
  prompt: string  // AI extraction prompt for this section
  required: boolean
}

export interface MemoTemplate {
  id: string
  name: string
  description: string
  sections: TemplateSection[]
  detectionKeywords: string[]
  systemPrompt: string
}

export const MEMO_TEMPLATES: MemoTemplate[] = [
  {
    id: 'founder-pitch',
    name: 'Founder Pitch',
    description: 'For startup pitch meetings and fundraising conversations',
    detectionKeywords: [
      'pitch', 'fundraising', 'seed', 'series', 'deck', 'invest', 'raise',
      'valuation', 'cap table', 'runway', 'traction', 'MRR', 'ARR', 'growth',
      'founder', 'co-founder', 'startup', 'venture'
    ],
    systemPrompt: `You are an expert VC analyst generating an investment memo from a founder pitch meeting.
Focus on extractable investment-relevant information. Be analytical and objective.
Highlight both opportunities and risks. Use bullet points for clarity.`,
    sections: [
      {
        id: 'company',
        title: 'Company Overview',
        prompt: `Extract and summarize:
- Company name and what they do (one sentence)
- Problem they're solving and why now
- Target market and TAM/SAM/SOM if mentioned
- Business model (how they make money)
- Current stage (pre-seed, seed, Series A, etc.)`,
        required: true,
      },
      {
        id: 'team',
        title: 'Team',
        prompt: `Extract information about the founding team:
- Founder names and backgrounds
- Relevant experience and expertise
- Team size and key hires
- Notable advisors or board members
- Any concerns about team gaps`,
        required: true,
      },
      {
        id: 'traction',
        title: 'Traction & Metrics',
        prompt: `Extract all quantitative metrics mentioned:
- Revenue (MRR, ARR, GMV)
- Growth rates (MoM, YoY)
- Users/customers (total, active, paying)
- Unit economics (CAC, LTV, margins)
- Key milestones achieved
Format as bullet points with specific numbers where available.`,
        required: true,
      },
      {
        id: 'product',
        title: 'Product & Differentiation',
        prompt: `Summarize the product and competitive positioning:
- Core product/service description
- Key differentiators and moat
- Technology advantages if any
- Competition mentioned and how they compare
- Product roadmap highlights`,
        required: true,
      },
      {
        id: 'ask',
        title: 'The Ask',
        prompt: `Extract fundraising details:
- Amount being raised
- Valuation or terms
- Use of funds
- Timeline and urgency
- Current investors or commitments`,
        required: true,
      },
      {
        id: 'concerns',
        title: 'Concerns & Risks',
        prompt: `Identify potential concerns and risks:
- Market risks
- Execution risks
- Team gaps
- Competitive threats
- Any red flags mentioned or implied`,
        required: true,
      },
      {
        id: 'next-steps',
        title: 'Next Steps',
        prompt: `Extract any discussed next steps:
- Follow-up meetings or calls
- Due diligence items
- Introductions to make
- Materials to review (deck, data room, etc.)
- Timeline for decision`,
        required: true,
      },
    ],
  },
  {
    id: 'customer-call',
    name: 'Customer Call',
    description: 'For customer feedback, product demos, and support calls',
    detectionKeywords: [
      'customer', 'client', 'user', 'feedback', 'feature request', 'bug',
      'support', 'demo', 'onboarding', 'churn', 'renewal', 'upsell',
      'product feedback', 'pain point', 'workflow'
    ],
    systemPrompt: `You are a product manager documenting a customer call.
Focus on actionable feedback, feature requests, and customer sentiment.
Identify patterns that could inform product decisions.`,
    sections: [
      {
        id: 'customer-context',
        title: 'Customer Context',
        prompt: `Extract customer information:
- Company name and size
- Role of the person(s) on the call
- How long they've been a customer
- Their use case and goals
- Current plan/tier if mentioned`,
        required: true,
      },
      {
        id: 'feedback',
        title: 'Product Feedback',
        prompt: `Summarize all product feedback:
- What's working well for them
- Pain points and frustrations
- Specific features mentioned (positive or negative)
- Comparison to competitors
- Workflow or usability issues`,
        required: true,
      },
      {
        id: 'feature-requests',
        title: 'Feature Requests',
        prompt: `List all feature requests or enhancement suggestions:
- Specific features requested
- Why they need each feature
- Priority/urgency indicated
- Workarounds they're using currently
Format as a numbered list with context.`,
        required: true,
      },
      {
        id: 'sentiment',
        title: 'Customer Sentiment',
        prompt: `Assess overall customer sentiment:
- Satisfaction level (happy, neutral, frustrated)
- NPS likelihood if discussed
- Churn risk indicators
- Expansion/upsell opportunities
- Relationship health`,
        required: true,
      },
      {
        id: 'action-items',
        title: 'Action Items',
        prompt: `Extract all action items and commitments:
- Items we committed to
- Items they committed to
- Follow-up needed
- Escalations required
Include owners and timelines if mentioned.`,
        required: true,
      },
    ],
  },
  {
    id: 'portfolio-update',
    name: 'Portfolio Update',
    description: 'For check-ins with portfolio companies',
    detectionKeywords: [
      'portfolio', 'update', 'board', 'quarterly', 'monthly', 'progress',
      'KPIs', 'metrics review', 'runway', 'hiring', 'fundraise', 'exit'
    ],
    systemPrompt: `You are a VC tracking portfolio company progress.
Focus on key metrics, challenges, and where support is needed.
Be objective about progress against goals.`,
    sections: [
      {
        id: 'metrics-update',
        title: 'Metrics Update',
        prompt: `Extract all key metrics discussed:
- Revenue/ARR and growth
- User metrics and engagement
- Burn rate and runway
- Team size changes
- Key milestones hit or missed
Compare to previous period or targets if mentioned.`,
        required: true,
      },
      {
        id: 'progress',
        title: 'Progress & Wins',
        prompt: `Summarize positive developments:
- Major wins and achievements
- Product launches or updates
- Customer wins
- Partnerships announced
- Team additions`,
        required: true,
      },
      {
        id: 'challenges',
        title: 'Challenges',
        prompt: `Identify current challenges:
- Operational issues
- Market headwinds
- Team challenges
- Product setbacks
- Competitive pressure`,
        required: true,
      },
      {
        id: 'support-needed',
        title: 'Support Needed',
        prompt: `Extract where they need investor support:
- Introductions requested (customers, hires, investors)
- Strategic advice needed
- Operational help
- Fundraising support
- Other resources`,
        required: true,
      },
      {
        id: 'outlook',
        title: 'Outlook & Next Period',
        prompt: `Summarize forward-looking items:
- Goals for next quarter/month
- Upcoming milestones
- Fundraising timeline
- Potential risks ahead
- Key decisions pending`,
        required: true,
      },
    ],
  },
  {
    id: 'recruiting',
    name: 'Recruiting',
    description: 'For candidate interviews and recruiting calls',
    detectionKeywords: [
      'candidate', 'interview', 'hire', 'recruiting', 'resume', 'experience',
      'role', 'position', 'offer', 'compensation', 'background check'
    ],
    systemPrompt: `You are a hiring manager documenting a candidate interview.
Focus on qualifications, cultural fit, and hiring decision factors.
Be objective and note both strengths and concerns.`,
    sections: [
      {
        id: 'candidate-profile',
        title: 'Candidate Profile',
        prompt: `Extract candidate information:
- Name and current role/company
- Years of experience
- Educational background
- Key skills and expertise
- Why they're looking/interested`,
        required: true,
      },
      {
        id: 'experience',
        title: 'Relevant Experience',
        prompt: `Summarize relevant experience:
- Previous roles and responsibilities
- Key achievements and impact
- Skills demonstrated
- Projects discussed
- Domain expertise`,
        required: true,
      },
      {
        id: 'assessment',
        title: 'Assessment',
        prompt: `Evaluate the candidate:
- Technical/skill fit (1-5 with notes)
- Cultural fit observations
- Communication and presence
- Strengths highlighted
- Concerns or gaps
- Comparison to other candidates`,
        required: true,
      },
      {
        id: 'logistics',
        title: 'Logistics & Expectations',
        prompt: `Extract practical details:
- Compensation expectations
- Start date availability
- Location/remote preferences
- Other processes they're in
- Timeline expectations`,
        required: true,
      },
      {
        id: 'recommendation',
        title: 'Recommendation',
        prompt: `Provide hiring recommendation:
- Overall recommendation (strong yes, yes, maybe, no)
- Key reasons for recommendation
- Next steps in process
- Additional evaluations needed
- Final decision factors`,
        required: true,
      },
    ],
  },
  {
    id: 'internal',
    name: 'Internal Meeting',
    description: 'For internal team meetings and planning sessions',
    detectionKeywords: [
      'team meeting', 'planning', 'strategy', 'internal', 'standup',
      'retrospective', 'all-hands', 'offsite', 'roadmap', 'OKRs'
    ],
    systemPrompt: `You are documenting an internal team meeting.
Focus on decisions made, action items, and key discussion points.
Ensure clarity on ownership and timelines.`,
    sections: [
      {
        id: 'attendees',
        title: 'Attendees',
        prompt: `List meeting participants:
- Names and roles of attendees
- Who led/facilitated
- Notable absences if mentioned`,
        required: false,
      },
      {
        id: 'agenda',
        title: 'Topics Discussed',
        prompt: `Summarize main discussion topics:
- Agenda items covered
- Key points for each topic
- Time spent on major items
- Items tabled or deferred`,
        required: true,
      },
      {
        id: 'decisions',
        title: 'Decisions Made',
        prompt: `Document all decisions:
- Specific decisions reached
- Rationale for each decision
- Stakeholders affected
- Any dissenting opinions noted`,
        required: true,
      },
      {
        id: 'action-items',
        title: 'Action Items',
        prompt: `Extract all action items:
- Task description
- Owner assigned
- Due date if set
- Priority level
- Dependencies
Format as a clear list with owners.`,
        required: true,
      },
      {
        id: 'follow-up',
        title: 'Follow-Up',
        prompt: `Note follow-up items:
- Next meeting scheduled
- Items to revisit
- Information to gather
- Stakeholders to inform`,
        required: true,
      },
    ],
  },
]

// Create a lookup map for quick access
export const TEMPLATE_MAP = new Map(
  MEMO_TEMPLATES.map(template => [template.id, template])
)

// Default template for unclassified meetings
export const DEFAULT_TEMPLATE = MEMO_TEMPLATES.find(t => t.id === 'internal')!

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): MemoTemplate {
  return TEMPLATE_MAP.get(id) || DEFAULT_TEMPLATE
}

/**
 * Get all available templates
 */
export function getAllTemplates(): MemoTemplate[] {
  return MEMO_TEMPLATES
}

export type MeetingType = 'founder-pitch' | 'customer-call' | 'portfolio-update' | 'recruiting' | 'internal'
