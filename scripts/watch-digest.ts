/**
 * Send each Pro workspace its weekly niche-watch digest:
 *
 *   npm run watch:digest
 *
 * Only posts newer than each topic's last digest are included. Topics are
 * marked sent only after the email went out, so a failed send is retried
 * (with the same window) next run. Workspaces with nothing new get no email.
 */
import "dotenv/config";

import { pool } from "@/db";
import { adminPool } from "@/db/admin";
import { sendWatchDigest } from "@/lib/email/watch-digest";
import { site } from "@/lib/site";
import { buildTopicDigest } from "@/lib/watch/digest";
import { listDigestTargets, markTopicsSent } from "@/lib/watch/store";

async function main() {
  const startedAt = new Date();
  const targets = await listDigestTargets();
  console.log(`[watch] ${targets.length} workspace(s) with topics`);
  let failed = 0;

  for (const target of targets) {
    const digests = [];
    for (const topic of target.topics) {
      digests.push(await buildTopicDigest(topic, { now: startedAt }));
    }
    const total = digests.reduce((sum, d) => sum + d.pains.length, 0);
    if (total === 0) {
      console.log(`[watch] ${target.orgName}: nothing new`);
      continue;
    }
    const { delivered } = await sendWatchDigest({
      to: target.emails,
      digests,
      dashboardUrl: `${site.url}/dashboard`,
    });
    if (delivered) {
      await markTopicsSent(
        target.topics.map((t) => t.id),
        startedAt,
      );
    } else {
      failed += 1;
    }
    console.log(
      `[watch] ${target.orgName}: ${total} pains, delivered=${delivered}`,
    );
  }
  if (failed > 0 && process.env.RESEND_API_KEY) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([pool.end(), adminPool.end()]);
  });
