This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Daily reminder push

Sends a daily Web Push reminder to users who enabled it (Settings → 每日提醒) and
haven't hit their goal that day. A standalone Cloudflare Cron Worker
(`workers/reminder`) runs hourly and pushes to the right users for that local hour.

Setup:

1. **Generate a VAPID keypair** (once): `npx web-push generate-vapid-keys --json`.
2. **Main app** — set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to the `publicKey` as a
   Cloudflare env var (public, not a secret). The Settings UI uses it to subscribe.
3. **Reminder worker** — set its secrets:
   ```bash
   cd workers/reminder
   npx wrangler kv namespace create REMINDER_LOCKS   # paste id into wrangler.toml
   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put VAPID_SUBJECT             # e.g. mailto:you@example.com
   npx wrangler secret put DATABASE_URL              # same Neon HTTP URL as main app
   npx wrangler deploy
   ```
   For local dev, copy `.dev.vars.example` to `.dev.vars` (gitignored) and fill it.

iOS note: push only works after the PWA is added to the home screen.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
