"""Pain-signal extractor for Reddit Pain Radar.

Takes raw posts (as produced by ``workers.reddit_client``), cheaply filters them
by pain-point regex phrases, then sends each qualifying post to the DeepSeek API
for structured pain-signal extraction. DeepSeek calls are bounded to 10
concurrent requests; 429/5xx responses are retried with exponential backoff.

Results can be written to a JSON file and/or stored in the ``pain_signals``
Postgres table (see ``db/schema.ts``). The ``raw_posts`` row is upserted first
so the foreign key is satisfied.

Environment variables:
    DEEPSEEK_API_KEY     DeepSeek API key (required for LLM extraction)
    DEEPSEEK_BASE_URL    default https://api.deepseek.com/v1
    DEEPSEEK_MODEL       default deepseek-chat
    REDDIT_PAIN_CLUSTER_PROMPT  optional override for the system prompt

Usage:
    python workers/pain_extractor.py posts.json --json-out out.json \
        --db-url postgresql://user:pass@host:5432/pain_radar
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

import requests

logger = logging.getLogger("reddit_pain_radar.pain_extractor")

DEFAULT_BASE_URL = "https://api.deepseek.com/v1"
DEFAULT_MODEL = "deepseek-chat"
DEFAULT_MAX_CONCURRENT = 10
DEFAULT_MAX_RETRIES = 4
DEFAULT_TIMEOUT = 60.0
DEFAULT_CONTEXT_RADIUS = 1

PAIN_PATTERNS: tuple[str, ...] = (
    r"i wish there was",
    r"anyone else struggling",
    r"how do you handle",
    r"is there a tool",
    r"this is driving me insane",
    r"i hate that",
    r"why is there no",
    r"looking for a solution",
)
_COMPILED_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE) for pattern in PAIN_PATTERNS
)
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")

_DEFAULT_CLUSTERING_PROMPT = """\
You are a product researcher for an "opportunity radar" tool. Your job is to \
read a Reddit post and extract concrete pain signals: problems users express, \
frustrations with existing tools, and unmet needs.

Instructions:
- Focus on the post ONLY. Ignore praise, shilling, or content with no problem statement.
- For each distinct pain signal, return ONE object.
- "theme": give a short, specific product-opportunity theme (e.g. "self-hosted \
backup for docker", not generic words like "problem").
- "verbatim_quote": a sentence copied VERBATIM from the post that best expresses \
the pain. Prefer one of the "# MATCHED SENTENCES" below when present.
- "urgency_score" (0-100): how immediately the user needs a fix.
- "wtp_score" (0-100): how plausible it is the user would pay for a solution.
- "composite_score" (0-100): overall opportunity = 0.5 * urgency + 0.5 * wtp.

Output ONLY strict JSON, no markdown fences, in this shape:
{"pain_signals": [{"theme": "...", "verbatim_quote": "...", \
"urgency_score": 0, "wtp_score": 0, "composite_score": 0}]}

If the post contains no real pain signal, return {"pain_signals": []}.
"""

CLUSTERING_PROMPT = os.environ.get(
    "REDDIT_PAIN_CLUSTER_PROMPT", _DEFAULT_CLUSTERING_PROMPT
)


@dataclass(slots=True)
class PainSignal:
    """A structured pain signal extracted from a single post."""

    theme: str
    verbatim_quote: str
    urgency_score: float
    wtp_score: float
    composite_score: float
    raw_post_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def detect_pain_phrases(text: str) -> list[str]:
    """Return unique (case-insensitive) pain phrases found in ``text``."""
    return [
        compiled.pattern
        for compiled in _COMPILED_PATTERNS
        if compiled.search(text or "")
    ]


def _split_sentences(text: str) -> list[str]:
    return [part.strip() for part in _SENTENCE_SPLIT_RE.split(text) if part.strip()]


def extract_context(text: str, match_start: int, radius: int = 1) -> str | None:
    """Return the sentences surrounding ``match_start`` (``radius`` on each side)."""
    sentences = _split_sentences(text)
    if not sentences:
        return None
    position = 0
    index = 0
    for i, sentence in enumerate(sentences):
        if match_start < position + len(sentence):
            index = i
            break
        position += len(sentence) + 1
    window = sentences[max(0, index - radius) : index + radius + 1]
    return " ".join(window)


def match_quotes(text: str, radius: int = DEFAULT_CONTEXT_RADIUS) -> list[str]:
    """Collect unique verbatim quotes around every regex hit in ``text``."""
    if not text:
        return []
    quotes: list[str] = []
    seen: set[str] = set()
    for compiled in _COMPILED_PATTERNS:
        for match in compiled.finditer(text):
            context = extract_context(text, match.start(), radius)
            if context and context.lower() not in seen:
                seen.add(context.lower())
                quotes.append(context)
    return quotes


def _normalize_post(raw: dict[str, Any]) -> dict[str, Any]:
    """Coerce either a ``Post.to_dict()`` or a raw Reddit listing child into one shape."""
    data = raw.get("data") or raw
    return {
        "reddit_id": str(data.get("reddit_id") or data.get("id") or ""),
        "title": str(data.get("title") or ""),
        "body": str(data.get("body") or data.get("selftext") or ""),
        "author": str(data.get("author") or ""),
        "score": int(data.get("score") or 0),
        "num_comments": int(data.get("num_comments") or 0),
        "created_utc": float(data.get("created_utc") or 0.0),
        "url": str(data.get("url") or ""),
        "subreddit": str(data.get("subreddit") or ""),
    }


def load_posts(source: str) -> list[dict[str, Any]]:
    """Load posts from a JSON file: a list, a single post, or a raw listing."""
    with open(source, encoding="utf-8") as handle:
        payload = json.load(handle)
    if isinstance(payload, list):
        posts = payload
    elif isinstance(payload, dict):
        children = payload.get("data", {}).get("children")
        posts = children if isinstance(children, list) else [payload]
    else:
        raise ValueError(f"unexpected JSON shape in {source!r}")
    return [_normalize_post(post) for post in posts]


class DeepSeekExtractor:
    """Runs DeepSeek chat completions for pain-signal extraction."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        model: str = DEFAULT_MODEL,
        prompt: str = CLUSTERING_PROMPT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key = api_key or os.environ.get("DEEPSEEK_API_KEY") or ""
        if not self.api_key:
            raise ValueError("DEEPSEEK_API_KEY is not set")
        self.base_url = os.environ.get("DEEPSEEK_BASE_URL", base_url).rstrip("/")
        self.model = os.environ.get("DEEPSEEK_MODEL", model)
        self.prompt = prompt
        self.max_retries = max(1, int(max_retries))
        self.timeout = float(timeout)

    def classify(
        self,
        post: dict[str, Any],
        quotes: list[str],
        raw_post_id: str | None = None,
    ) -> list[PainSignal]:
        """Extract one or more pain signals from a single post."""
        user_content = (
            f"# Reddit post (r/{post['subreddit']})\n"
            f"Title: {post['title']}\n"
            f"Text:\n{post.get('body') or '(no body)'}"
        )
        if quotes:
            user_content += "\n\n# MATCHED SENTENCES (use verbatim when relevant)\n- " + (
                "\n- ".join(quotes)
            )

        payload = {
            "model": self.model,
            "temperature": 0.2,
            "max_tokens": 1500,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": self.prompt},
                {"role": "user", "content": user_content},
            ],
        }
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        backoff = 1.0
        last_error: str | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = requests.post(url, headers=headers, json=payload, timeout=self.timeout)
            except requests.RequestException as exc:
                last_error = str(exc)
                self._log_failure(post, attempt, last_error)
                time.sleep(backoff + random.uniform(0, 0.5))
                backoff = min(backoff * 2, 30.0)
                continue

            if resp.status_code == 429:
                last_error = f"429 {resp.text[:120]}"
                self._log_failure(post, attempt, last_error)
                retry_after = resp.headers.get("retry-after")
                wait = max(float(retry_after), 0.0) if retry_after else backoff
                time.sleep(wait + random.uniform(0, 0.5))
                backoff = min(backoff * 2, 30.0)
                continue

            if resp.status_code >= 500 and attempt < self.max_retries:
                last_error = f"{resp.status_code} {resp.text[:120]}"
                self._log_failure(post, attempt, last_error)
                time.sleep(backoff + random.uniform(0, 0.5))
                backoff = min(backoff * 2, 30.0)
                continue

            if resp.status_code != 200:
                raise RuntimeError(
                    f"DeepSeek returned {resp.status_code}: {resp.text[:300]}"
                )
            content = self._extract_content(resp)
            signals = self._parse_signals(content)
            if raw_post_id:
                for signal in signals:
                    signal.raw_post_id = raw_post_id
            return signals

        raise RuntimeError(f"DeepSeek request failed after retries: {last_error}")

    @staticmethod
    def _extract_content(resp: requests.Response) -> str:
        body = resp.json()
        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError(f"unexpected DeepSeek payload: {body}") from exc
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"```\s*$", "", content)
        return content

    @staticmethod
    def _parse_signals(content: str) -> list[PainSignal]:
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"DeepSeek returned invalid JSON: {content[:300]}") from exc
        if isinstance(parsed, list):
            items = parsed
        else:
            items = parsed.get("pain_signals") or []
        signals: list[PainSignal] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            theme = str(item.get("theme") or "").strip()
            quote = str(item.get("verbatim_quote") or "").strip()
            if not theme or not quote:
                continue
            urgency = _clamp_score(item.get("urgency_score"))
            wtp = _clamp_score(item.get("wtp_score"))
            composite = _clamp_score(
                item.get("composite_score"),
                fallback=0.5 * urgency + 0.5 * wtp,
            )
            signals.append(
                PainSignal(
                    theme=theme,
                    verbatim_quote=quote,
                    urgency_score=urgency,
                    wtp_score=wtp,
                    composite_score=composite,
                )
            )
        return signals

    def _log_failure(self, post: dict[str, Any], attempt: int, message: str) -> None:
        logger.warning(
            "DeepSeek attempt %d/%d failed for reddit_id=%s: %s",
            attempt,
            self.max_retries,
            post.get("reddit_id"),
            message,
        )


def _clamp_score(value: Any, fallback: float = 0.0) -> float:
    try:
        return max(0.0, min(100.0, float(value)))
    except (TypeError, ValueError):
        return max(0.0, min(100.0, fallback))


def process_posts(
    posts: Iterable[dict[str, Any]],
    extractor: DeepSeekExtractor,
    max_concurrent: int = DEFAULT_MAX_CONCURRENT,
    db_url: str | None = None,
) -> list[PainSignal]:
    """Regex-filter posts, then extract pain signals with bounded concurrency."""
    posts = list(posts)
    entries: list[tuple[dict[str, Any], list[str], str | None]] = []
    for post in posts:
        text = f"{post['title']}\n{post.get('body') or ''}"
        quotes = match_quotes(text)
        if not detect_pain_phrases(text):
            continue
        raw_post_id = upsert_raw_post(db_url, post) if db_url else None
        entries.append((post, quotes, raw_post_id))

    logger.info("%d/%d posts passed the regex pain filter", len(entries), len(posts))
    if not entries:
        return []

    signals: list[PainSignal] = []
    failed = 0
    with ThreadPoolExecutor(max_workers=max_concurrent) as pool:
        futures = [
            pool.submit(extractor.classify, post, quotes, raw_post_id)
            for post, quotes, raw_post_id in entries
        ]
        for future in as_completed(futures):
            try:
                signals.extend(future.result())
            except Exception:  # noqa: BLE001 - a single failure must not kill the batch
                failed += 1
                logger.exception("post extraction failed")
    if failed:
        logger.error("%d post(s) failed extraction after retries", failed)

    if db_url and signals:
        total = 0
        grouped: dict[str, list[PainSignal]] = {}
        for signal in signals:
            if signal.raw_post_id:
                grouped.setdefault(signal.raw_post_id, []).append(signal)
        for raw_post_id, group in grouped.items():
            total += store_pain_signals(db_url, raw_post_id, group)
        logger.info("Stored %d pain signal(s) into pain_signals", total)
    return signals


def upsert_raw_post(db_url: str, post: dict[str, Any]) -> str:
    """Insert or update the raw_post row and return its uuid."""
    import psycopg

    created_utc = datetime.fromtimestamp(post["created_utc"], tz=timezone.utc)
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO raw_posts
                    (subreddit, reddit_id, title, body, author, score,
                     num_comments, created_utc, url)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (reddit_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    body = EXCLUDED.body,
                    score = EXCLUDED.score,
                    num_comments = EXCLUDED.num_comments,
                    url = EXCLUDED.url
                RETURNING id
                """,
                (
                    post["subreddit"],
                    post["reddit_id"],
                    post["title"],
                    post["body"],
                    post["author"],
                    post["score"],
                    post["num_comments"],
                    created_utc,
                    post["url"],
                ),
            )
            row = cur.fetchone()
            if row is None:
                raise RuntimeError(f"could not resolve raw_post for {post['reddit_id']}")
            return str(row[0])


def store_pain_signals(
    db_url: str, raw_post_id: str, signals: list[PainSignal]
) -> int:
    """Persist pain signals into the ``pain_signals`` table.

    Idempotent: a unique index on (raw_post_id, theme, md5(verbatim_quote))
    skips signals already stored, so re-running extraction over the same post
    does not create duplicates. Returns the number of rows actually inserted.
    """
    import psycopg

    rows = [
        (
            raw_post_id,
            signal.theme,
            signal.verbatim_quote,
            signal.urgency_score or None,
            signal.wtp_score or None,
            signal.composite_score or None,
        )
        for signal in signals
    ]
    if not rows:
        return 0
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO pain_signals
                    (raw_post_id, theme, verbatim_quote, urgency_score,
                     wtp_score, composite_score)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                rows,
            )
            inserted = cur.rowcount
    return inserted if inserted >= 0 else len(rows)


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Reddit Pain Radar pain extractor")
    parser.add_argument("input", help="JSON file: list of posts, single post, or raw listing")
    parser.add_argument("--json-out", help="write extracted signals as JSON here")
    parser.add_argument("--db-url", help="postgres URL to store into pain_signals")
    parser.add_argument(
        "--max-concurrent", type=int, default=DEFAULT_MAX_CONCURRENT
    )
    parser.add_argument("--model", default=DEFAULT_MODEL)
    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    args = _build_arg_parser().parse_args(argv)

    posts = load_posts(args.input)
    logger.info("Loaded %d posts from %s", len(posts), args.input)

    extractor = DeepSeekExtractor(model=args.model)
    signals = process_posts(
        posts,
        extractor,
        max_concurrent=args.max_concurrent,
        db_url=args.db_url,
    )

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as handle:
            json.dump(
                [s.to_dict() for s in signals], handle, ensure_ascii=False, indent=2
            )
        logger.info("Wrote %d signals to %s", len(signals), args.json_out)

    for signal in signals[:5]:
        logger.info(
            "signal theme=%r quote=%r urgency=%s wtp=%s composite=%s",
            signal.theme,
            signal.verbatim_quote,
            signal.urgency_score,
            signal.wtp_score,
            signal.composite_score,
        )
    print(f"{len(signals)} pain signal(s) extracted from {len(posts)} post(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())