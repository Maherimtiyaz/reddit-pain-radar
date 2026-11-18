/** Text helpers shared by every source adapter. Pure, no I/O. */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode the HTML entities source APIs actually emit (named + numeric). */
export function decodeEntities(input: string): string {
  return input.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, body: string) => {
      if (body[0] === "#") {
        const hex = body[1] === "x" || body[1] === "X";
        const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    },
  );
}

/**
 * HTML fragment → plain text. Paragraph and line breaks become sentence
 * breaks so quote extraction still finds sentence boundaries.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<\s*(p|br|li|div|pre|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  return collapseWhitespace(decodeEntities(withBreaks));
}

/** Collapse runs of whitespace; keep single newlines as sentence hints. */
export function collapseWhitespace(input: string): string {
  return input
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim();
}

/** Cap text to `max` chars on a word boundary, adding an ellipsis. */
export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace >= max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Narrow an unknown JSON value to a finite number, or undefined. */
export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** Narrow an unknown JSON value to a non-empty string, or null. */
export function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
