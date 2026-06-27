import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Prisma 7 reads the migration datasource URL from this config file (the
// schema no longer carries `url`; it flows through the Neon adapter at
// runtime). `dotenv/config` loads .env so CLI commands like `db push` and
// `migrate` get DATABASE_URL. Contains no secrets — value comes from env.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
