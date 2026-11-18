/**
 * Evidence: one public post, comment or issue that might describe a pain.
 *
 * Every source adapter normalizes into this shape so the scoring, reporting
 * and newsletter code never needs to know where a quote came from.
 */

export type EvidenceSource = "hackernews" | "github";

export type EvidenceKind = "comment" | "story" | "issue";

export type Evidence = {
  /** Globally unique: `${source}:${externalId}`. Used for de-duplication. */
  id: string;
  source: EvidenceSource;
  kind: EvidenceKind;
  /** The id on the source platform (HN item id, GitHub issue node URL). */
  externalId: string;
  /** Link to the original post — every quote we show must carry one. */
  url: string;
  /** Thread/story/issue title the text belongs to, when known. */
  title: string | null;
  /** Plain text (HTML stripped, whitespace collapsed, length-capped). */
  text: string;
  /** Public username on the source, when the source exposes one. */
  author: string | null;
  /** ISO-8601 timestamp of when the post was written. */
  createdAt: string;
  /** Engagement numbers the source exposes (missing = not reported). */
  engagement: {
    points?: number;
    comments?: number;
    reactions?: number;
  };
  /** The search query that surfaced this item. */
  matchedQuery: string;
};

/** A failure from one source/query. Collection continues past it. */
export type EvidenceError = {
  source: EvidenceSource;
  query: string;
  message: string;
};

export type EvidenceResult = {
  evidence: Evidence[];
  errors: EvidenceError[];
};
