# 🌾 Rythu Nestham (AI Agricultural Assistant)

## Project Context & Mission
An AI Agent application empowering farmers in Telangana & Andhra Pradesh. The app diagnoses crop diseases from uploaded photos, handles Telugu voice queries, and delivers low-cost agricultural solutions retrieved from ANGRAU & ICAR research data.

- **Target Persona:** Farmers (including illiterate farmers relying on Telugu voice STT/TTS)
- **Primary Language:** Telugu (`te-IN`)
- **Primary Objective:** Deliver high-accuracy crop diagnosis while prioritizing low-cost and organic farm solutions.

---

## Tech Stack & Core Libraries
- **Framework:** Next.js (App Router, TypeScript)
- **Styling & UI:** Tailwind CSS, `shadcn/ui`, Lucide React Icons
- **AI Agent Framework:** Vercel AI SDK (`ai`), default Gemini 2.5 Flash. Models are switchable via `CHAT_MODEL` / `OCR_MODEL` / `EMBEDDING_MODEL` (`provider:model`; google, openai, anthropic, OpenAI-compatible `compat`) — resolved in `lib/ai.ts`, documented in `.env.example`. Never import a provider directly elsewhere.
- **Vector Database (RAG):** Supabase `pgvector` holding ANGRAU & ICAR PDF chunks
- **Voice Processing:** Web Speech API / OpenAI Whisper (Speech-to-Text) & Web Speech API / Google TTS (Text-to-Speech)

---

## Development Commands
- `npm run dev` — Start local development server (Port 3000)
- `npm run build` — Run production build
- `npm run typecheck` — Run TypeScript compiler verification (`tsc --noEmit`)
- `npm run lint` — Run ESLint checks

---

## Key File Locations & Architecture
- `app/api/chat/route.ts` — Vercel AI SDK backend route handling Gemini multimodal calls & RAG tools
- `app/page.tsx` — Main Telugu Voice & Camera UI built with `shadcn/ui`
- `components/ui/` — `shadcn/ui` primitive components (`button.tsx`, `card.tsx`, `input.tsx`)
- `lib/supabase.ts` — Supabase client configuration for pgvector searches
- `scripts/ingest-pdf.ts` — TypeScript ingestion (`npm run ingest`) for ANGRAU/ICAR files in `data/pdfs/<crop>/`; Gemini `gemini-embedding-001` @768 dims → `crop_knowledge`
- `lib/rag.ts` — embedding + `match_crop_knowledge` search (banned-pesticide sentences redacted via `lib/banned-pesticides.ts`)
- `components/chat/` — Telugu chat UI (AI Elements + shadcn); `hooks/` — Web Speech STT/TTS (`te-IN`)
- Accounts (custom, no Supabase Auth/OTP): `lib/auth.ts` (scrypt passwords, one-session-per-user httpOnly cookie), `app/login/` (login/sign-up/forgot Server Actions + UI), `app/admin/` (admin: create users, plans, password reset). Tables in `supabase/migrations/0003_accounts.sql` (RLS on, service-role only). Create/promote an admin: `npm run create-admin <username> <password> [phone]`
- Admin AI settings (`/admin/ai`): chat/OCR model + API keys per provider, stored AES-GCM encrypted (`lib/secrets.ts`) in `ai_settings` (`supabase/migrations/0004_ai_settings.sql`), loaded with a 30s cache by `lib/ai-settings.ts`. Order: admin setting → `.env.local` → default. Model lists in `lib/ai-models.ts`. Model getters in `lib/ai.ts` are async (`await chatModel()`).
- `app/profile/` — user's own account, plan & usage. Home header avatar (`components/chat/profile-menu.tsx`): farmers → `/profile`; admins get a menu (profile, `/admin`, `/admin/ai`)
- UI language (te/en, `lang` cookie): static text only, in `lib/i18n/dictionaries.ts` (`te` is the source, `en` must match). Server: `getDictionary()`; client: `useI18n()` → `t`, `tr()` (translates Telugu error strings). AI answers, chat-route replies, example questions and voice stay Telugu. New UI text goes into both dictionaries.
- Plans & credits: `lib/plans.ts` (limits, IST days, Telugu messages), `lib/usage.ts` (`use_credits`/`add_usage` RPCs, charged in `app/api/chat/route.ts`). Chats are never stored server-side: `lib/chat-history.ts` (localStorage)
- Forms: react-hook-form + zod; shared schemas in `lib/validation.ts` are re-checked in every Server Action

---

## Critical Rules & Guidelines for Claude Code

### 1. Language & Voice Compatibility
- **Always generate system responses in clear, conversational Telugu (`te-IN`).**
- Keep sentences concise and simple so they sound natural when read aloud by Text-to-Speech engines.

### 2. RAG & Safety Logic
- **RAG First:** Before answering crop disease, pesticide, or dosage questions, invoke the `queryCropKnowledgeBase` tool to search ANGRAU/ICAR data first.
- **Cost Efficiency:** Always recommend low-cost, locally available, or organic alternatives over expensive brand-name chemical pesticides.
- **Safety Restriction:** Do NOT recommend banned or dangerous chemical products.

### 3. Coding Conventions
- Use Next.js App Router conventions and Server Actions where applicable.
- Use `shadcn/ui` for all UI components. Do not invent raw custom CSS when Tailwind utility classes or `shadcn` components exist.