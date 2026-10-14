/**
 * Exports the landing-page waitlist to CSV. No admin route — run it locally or
 * from a cron/CI job:
 *
 *   npm run db:export:waitlist            # CSV to stdout
 *   npm run db:export:waitlist -- --out waitlist.csv
 *
 * Needs DATABASE_URL (loaded from .env via dotenv, matching drizzle-kit).
 */
import "dotenv/config";

import { writeFileSync } from "node:fs";

import { Pool } from "pg";

type WaitlistRow = {
  id: string;
  email: string;
  source: string;
  created_at: Date;
};

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. See .env.example.");
    process.exit(1);
  }

  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;

  const pool = new Pool({ connectionString: url });
  try {
    const { rows } = await pool.query<WaitlistRow>(
      "select id, email, source, created_at from waitlist order by created_at asc",
    );
    const header = "id,email,source,created_at";
    const lines = rows.map((row) =>
      [row.id, row.email, row.source, row.created_at.toISOString()]
        .map(csvCell)
        .join(","),
    );
    const csv = `${[header, ...lines].join("\n")}\n`;

    if (outPath) {
      writeFileSync(outPath, csv, "utf8");
      console.error(`Wrote ${rows.length} row(s) to ${outPath}`);
    } else {
      process.stdout.write(csv);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
