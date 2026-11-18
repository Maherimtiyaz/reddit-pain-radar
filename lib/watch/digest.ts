/**
 * Weekly niche-watch digest for Pro workspaces. Deliberately model-free:
 * new posts matching each topic, filtered by the pain-phrase detector,
 * quoted verbatim with links. Cheap enough to run for every subscriber.
 */

import {
  collectEvidence,
  selectPainful,
  type SourceSearch,
} from "@/lib/evidence/collect";
import type { Evidence, EvidenceResult } from "@/lib/evidence/types";

export const PAINS_PER_TOPIC = 5;
/** Issues this popular count even without a stock pain phrase. */
const ISSUE_REACTIONS_FLOOR = 10;
const MAX_LOOKBACK_DAYS = 14;
const DAY_MS = 86_400_000;

export type TopicPain = {
  quote: string;
  url: string;
  source: Evidence["source"];
  date: string;
  context: string | null;
  engagement: string;
};

export type TopicDigest = {
  topicId: string;
  topic: string;
  pains: TopicPain[];
};

function score(item: Evidence): number {
  const { points = 0, comments = 0, reactions = 0 } = item.engagement;
  return points + comments * 2 + reactions * 2;
}

function engagementLine(item: Evidence): string {
  const { points, comments, reactions } = item.engagement;
  return [
    reactions ? `${reactions} 👍` : "",
    points ? `${points} points` : "",
    comments ? `${comments} comments` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function topicSearches(
  topic: string,
  since: Date,
  now: Date,
): SourceSearch[] {
  const days = Math.min(
    MAX_LOOKBACK_DAYS,
    Math.max(1, Math.ceil((now.getTime() - since.getTime()) / DAY_MS)),
  );
  return [
    {
      source: "hackernews",
      kind: "comment",
      query: topic,
      sinceDays: days,
      sort: "date",
      limit: 40,
    },
    {
      source: "github",
      query: topic,
      sinceDays: days,
      sort: "created",
      limit: 15,
    },
  ];
}

/**
 * Newest-first window → the strongest few pains: comments/issues with a pain
 * phrase (quote around it), plus popular issues (their title), newer than
 * `since`, ranked by engagement.
 */
export function pickTopicPains(
  evidence: Evidence[],
  since: Date,
  max = PAINS_PER_TOPIC,
): TopicPain[] {
  const fresh = evidence.filter(
    (item) => Date.parse(item.createdAt) > since.getTime(),
  );
  const painful = selectPainful(fresh);
  const painfulIds = new Set(painful.map((item) => item.id));
  const popularIssues = fresh.filter(
    (item) =>
      item.source === "github" &&
      !painfulIds.has(item.id) &&
      (item.engagement.reactions ?? 0) >= ISSUE_REACTIONS_FLOOR,
  );

  const candidates = [
    ...painful.map((item) => ({ item, quote: item.quotes[0] ?? item.text })),
    ...popularIssues.map((item) => ({ item, quote: item.title ?? item.text })),
  ];
  return candidates
    .sort((a, b) => score(b.item) - score(a.item))
    .slice(0, max)
    .map(({ item, quote }) => ({
      quote: quote.length > 320 ? `${quote.slice(0, 319)}…` : quote,
      url: item.url,
      source: item.source,
      date: item.createdAt.slice(0, 10),
      context: item.source === "hackernews" ? item.title : null,
      engagement: engagementLine(item),
    }));
}

export async function buildTopicDigest(
  topic: {
    id: string;
    topic: string;
    lastSentAt: Date | null;
    createdAt: Date;
  },
  options: {
    now?: Date;
    collect?: (searches: SourceSearch[]) => Promise<EvidenceResult>;
  } = {},
): Promise<TopicDigest> {
  const now = options.now ?? new Date();
  const collect = options.collect ?? ((searches) => collectEvidence(searches));
  const since = topic.lastSentAt ?? new Date(now.getTime() - 7 * DAY_MS);
  const { evidence } = await collect(topicSearches(topic.topic, since, now));
  return {
    topicId: topic.id,
    topic: topic.topic,
    pains: pickTopicPains(evidence, since),
  };
}
