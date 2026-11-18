/**
 * Cheap, deterministic pain detection — the prefilter that runs before any
 * LLM call. Ported from the worker's `extract/patterns.py` and extended with
 * willingness-to-pay phrases, which matter most for PainProof's score.
 */

export type PainKind = "pain" | "wtp";

type PainPattern = { kind: PainKind; regex: RegExp };

const PAIN_PATTERNS: PainPattern[] = [
  // Explicit wishes and tool requests.
  /I wish there (was|were)/,
  /anyone else (struggling|have this problem)/,
  /how do you (guys |all )?(handle|deal with)/,
  /is there (a|any) (good |better )?(tool|way|app|service)/,
  /this is driving me (insane|crazy|nuts)/,
  /drives me (insane|crazy|nuts)/,
  /I hate (that|when|how)/,
  /why (is there no|isn't there|doesn't .{1,40} exist)/,
  /looking for (a|an) (solution|tool|alternative|app)/,
  /any recommendations for/,
  /what do you use (for|to)/,
  /frustrated with/,
  /(so|really) frustrating/,
  /(tired|sick) of/,
  /struggling with/,
  /(waste|wasting) (so much )?time/,
  /(still|have to) do (it|this) manually/,
  /there has to be a better way/,
].map((regex) => ({ kind: "pain" as const, regex }));

const WTP_PATTERNS: PainPattern[] = [
  /(I|we)('d| would) (happily |gladly )?pay/,
  /would pay (good money|for)/,
  /shut up and take my money/,
  /(we|I) (currently )?pay \$?\d/,
  /(too|so) expensive/,
  /(price|pricing) (increase|hike)/,
  /switched (away )?from/,
  /cancel(led|ing)? (my|our) subscription/,
  /not worth (the|it)/,
].map((regex) => ({ kind: "wtp" as const, regex }));

const ALL_PATTERNS: PainPattern[] = [...PAIN_PATTERNS, ...WTP_PATTERNS].map(
  ({ kind, regex }) => ({ kind, regex: new RegExp(regex.source, "gi") }),
);

export type PainMatch = {
  kind: PainKind;
  phrase: string;
  index: number;
};

/** Every pain / willingness-to-pay phrase in `text`, ordered by position. */
export function findPainMatches(text: string): PainMatch[] {
  if (!text) return [];
  const matches: PainMatch[] = [];
  for (const { kind, regex } of ALL_PATTERNS) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      matches.push({ kind, phrase: match[0], index: match.index });
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

export function hasPainPhrase(text: string): boolean {
  return findPainMatches(text).length > 0;
}

/** Sentence boundaries: end punctuation followed by space, or a newline. */
const SENTENCE_BREAK = /(?<=[.!?])\s+|\n+/g;

function sentenceSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let start = 0;
  for (const match of text.matchAll(SENTENCE_BREAK)) {
    spans.push([start, match.index]);
    start = match.index + match[0].length;
  }
  spans.push([start, text.length]);
  return spans.filter(([a, b]) => b > a);
}

/**
 * The sentence containing `index`, plus one sentence either side, capped to
 * `maxLength`. This is the quote we show — always a verbatim substring.
 */
export function extractQuote(
  text: string,
  index: number,
  maxLength = 320,
): string {
  const spans = sentenceSpans(text);
  const at = spans.findIndex(([a, b]) => index >= a && index < b);
  if (at === -1) return text.slice(0, maxLength).trim();

  const [sentenceStart, sentenceEnd] = spans[at];
  if (sentenceEnd - sentenceStart > maxLength) {
    // One sentence alone is too long: a window around the match instead.
    const start = Math.max(sentenceStart, index - Math.floor(maxLength / 3));
    return text
      .slice(start, start + maxLength)
      .trim()
      .replace(/\n+/g, " ");
  }

  // Grow by one sentence either side while it still fits.
  let from = at;
  let to = at;
  if (from > 0 && sentenceEnd - spans[from - 1][0] <= maxLength) from -= 1;
  if (to < spans.length - 1 && spans[to + 1][1] - spans[from][0] <= maxLength) {
    to += 1;
  }
  return text.slice(spans[from][0], spans[to][1]).trim().replace(/\n+/g, " ");
}

/** Distinct quotes for every pain match in `text`, strongest-first order kept. */
export function extractPainQuotes(text: string, maxQuotes = 3): string[] {
  const quotes: string[] = [];
  for (const match of findPainMatches(text)) {
    const quote = extractQuote(text, match.index);
    if (
      !quotes.some(
        (existing) => existing.includes(quote) || quote.includes(existing),
      )
    ) {
      quotes.push(quote);
    }
    if (quotes.length >= maxQuotes) break;
  }
  return quotes;
}
