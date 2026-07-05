import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Prisma 6: the datasource `url` lives in schema.prisma (`env("DATABASE_URL")`).
// When a prisma.config.ts is present, Prisma no longer auto-loads .env, so we
// import `dotenv/config` here to make DATABASE_URL available to CLI commands
// like `db push`/`migrate`/`generate`. Contains no secrets — value from env.
export default defineConfig({
  schema: 'prisma/schema.prisma',
})
