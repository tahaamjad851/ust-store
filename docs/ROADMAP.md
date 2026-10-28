# Roadmap

Each phase ends with a summary to the user and waits for approval before the next one starts.
After every phase from Phase 1 on, run the `security-reviewer` agent on the changes and fix what it finds before reporting done.

## Phase 0: Setup

Rules: follow every rule in CLAUDE.md. Never read or print `.env*` files (except `.env.example`), `client-data/` or `private/`.

0. Save this plan to `docs/ROADMAP.md`. Add "Project phases are defined in docs/ROADMAP.md" to CLAUDE.md.
1. Keep the existing folder structure. Node 24 is installed. Create the Next.js app (App Router, TypeScript, Tailwind, ESLint, `src/` directory) in a temporary folder and merge it in, so existing files (CLAUDE.md, .gitignore, .claude/settings.json, README.md, .env.example) are kept, not overwritten. Use the latest stable versions. Check that Next.js supports the TypeScript version first. If it doesn't support TypeScript 7, use 5.x.
2. Install and configure: shadcn/ui, lucide-react, react-hook-form, zod, @hookform/resolvers, @supabase/supabase-js, @supabase/ssr, vitest, @playwright/test, recharts (admin charts), @react-pdf/renderer (invoices). Explain any other dependency before adding it.
3. Create four subagents in `.claude/agents/` (markdown with frontmatter):
   - `security-reviewer`: read-only. Reviews diffs for secrets, missing RLS, client-trusted prices, XSS/SQLi, unsafe uploads, exposed keys, risky dependencies.
   - `db-architect`: Postgres schema, migrations, RLS policies, indexes, transactions, integer-paisa money.
   - `ui-designer`: builds screens from the approved images in `design/`, using shadcn/ui, mobile-first, with accessible contrast.
   - `test-writer`: unit, integration and Playwright tests for cart, pricing, checkout, stock and permissions.
4. Add npm scripts: dev, build, lint, typecheck, test, test:e2e. Add these commands to CLAUDE.md.
5. Add Supabase server and browser clients in `src/lib/supabase`. Put the variable names (names only) in `.env.example`.
6. Configure security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy) in next.config.
7. Make sure `private/` is in `.gitignore` and in the deny list of `.claude/settings.json`. Keep every existing deny/ask rule.
8. Run lint, typecheck and build. Fix any failure.
9. Rename the branch to main (`git branch -M main`) and make the first commit. Before committing, run `git status` and confirm that no `.env*` file (except `.env.example`), `client-data/` or `private/` is staged.

Deliverables: the architecture summary, the implementation checklist by phase, the environment variables the user must fill in, and the database schema plan.

## Later phases

Defined after Phase 0 is approved. See the checklist below; it is a proposal until the user approves it.
