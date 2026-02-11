# VC Meeting OS v2 - Beta Testing Guide

## Quick Start for Testers

### 1. Sign Up
1. Go to https://ai-vc-v2.vercel.app
2. Click "Continue with Google"
3. Grant access to Google Drive (for memo filing)

### 2. Connect Fireflies
1. Go to **Settings** → **Integrations**
2. Enter your Fireflies API key (get from fireflies.ai → Settings → API)
3. Click "Connect"

### 3. Process Your First Meeting
- **Option A**: Have a new meeting with Fireflies → memo auto-generates
- **Option B**: Go to **Dashboard** → Click "Sync from Fireflies" to import existing transcripts

### 4. Explore Features
- **Memos**: View all meeting notes with AI-generated summaries
- **Companies**: Track companies through deal stages (tracking → invested)
- **People**: Auto-extracted contacts from meetings
- **Tasks**: Action items linked to memos
- **Chat**: Ask questions about your meetings

---

## Core Workflow to Test

```
Fireflies Meeting → Auto-transcription → Webhook triggers
       ↓
AI Processing (Claude)
   • Company detection
   • Meeting type classification
   • Memo generation
   • Contact extraction
       ↓
Results appear in:
   • /memos (the meeting memo)
   • /companies (detected company)
   • /people (extracted contacts)
   • Google Drive (filed document)
```

---

## What to Look For (Feedback Areas)

### ✅ Does It Work?
- [ ] Can you sign in with Google?
- [ ] Does Fireflies integration connect?
- [ ] Do memos generate from transcripts?
- [ ] Are companies detected correctly?
- [ ] Are contacts extracted properly (people, not companies)?
- [ ] Does Google Drive filing work?

### 🎨 Is It Usable?
- [ ] Is navigation intuitive?
- [ ] Are loading states clear?
- [ ] Do error messages make sense?
- [ ] Does it work on mobile?

### 🐛 Any Bugs?
- [ ] Anything crash or hang?
- [ ] Missing data or blank screens?
- [ ] Buttons that don't work?

---

## Known Limitations (Beta)

1. **Processing Time**: First memo may take 30-60 seconds
2. **Contact Extraction**: May occasionally miss people or include company names
3. **Company Detection**: Works best when company name is clearly mentioned
4. **Mobile**: Core features work, but optimized for desktop

---

## How to Report Issues

Email feedback to: [YOUR EMAIL]

Include:
- What you were trying to do
- What happened instead
- Screenshot if possible
- Browser/device info

---

## Tech Stack (for technical testers)

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 14 + React + Tailwind |
| Database | Supabase (PostgreSQL) |
| Auth | Google OAuth |
| AI | Claude 3 Haiku |
| File Storage | Google Drive |
| Hosting | Vercel |

---

## Data Privacy

- Your data is isolated to your account (Row Level Security)
- Memos are stored in your Google Drive
- We use Claude AI for processing (Anthropic)
- No data is shared between users

---

## Contact

Questions? Email [YOUR EMAIL] or reach out on [PREFERRED CHANNEL]
