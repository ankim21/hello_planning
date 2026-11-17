// Reads and checks the environment once, at start-up. A missing or weak
// setting stops the application immediately instead of failing later.
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default('development'),
  // E-mail is optional: without SMTP_URL nothing is sent.
  SMTP_URL: z.string().optional().transform((url) => url || undefined),
  MAIL_FROM: z.string().default('PLANetBAO <no-reply@example.com>'),
  APP_URL: z.string().default('http://localhost:5173'),
});

export const config = schema.parse(process.env);
