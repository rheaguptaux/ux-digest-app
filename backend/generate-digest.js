// Daily UX news digest generator.
// 1. Pulls articles from a curated list of UX-focused RSS feeds
// 2. Dedupes by link across feeds (fixes duplicate stories from overlapping tags)
// 3. Skips anything already summarized before (tracked in seen.json)
// 4. Sends new articles to Claude to produce a structured, resource-style summary
// 5. Writes the result to digest.json (what the app reads)
//
// Run with: ANTHROPIC_API_KEY=sk-... node generate-digest.js

import Parser from "rss-parser";
import fs from "fs/promises";
import path from "path";

const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

// --- Configure your sources here ---
// "type": "research" -> institutional/official sources, shown as Trending/This week
// "type": "opinion"  -> Medium-based essays and personal takes, shown in their own Opinions section
const FEEDS = [
  { url: "https://www.nngroup.com/feed/rss/", type: "research", category: "Research" },
  { url: "https://www.smashingmagazine.com/feed/", type: "research", category: "Design & dev" },
  { url: "https://alistapart.com/main/feed/", type: "research", category: "Design & dev" },

  { url: "https://medium.com/feed/tag/ux", type: "opinion", category: "UX" },
  { url: "https://medium.com/feed/tag/ux-research", type: "opinion", category: "Research" },
  { url: "https://medium.com/feed/tag/product-design", type: "opinion", category: "Product design" },
  { url: "https://uxdesign.cc/feed", type: "opinion", category: "UX" },
  { url: "https://uxplanet.org/feed", type: "opinion", category: "UX" },
];

const MAX_ITEMS_PER_DAY = 10; // total across all sources — keeps it curated, not a firehose
const MAX_ARTICLE_AGE_DAYS = 7; // matches the "this week" window shown in the app
const SEEN_FILE = path.join(process.cwd(), "seen.json");
const OUTPUT_FILE = path.join(process.cwd(), "..", "digest.json");

async function loadSeen() {
  try {
    const raw = await fs.readFile(SEEN_FILE, "utf-8");
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

async function saveSeen(seenSet) {
  const arr = Array.from(seenSet).slice(-800);
  await fs.writeFile(SEEN_FILE, JSON.stringify(arr, null, 2));
}

function extractImage(item) {
  if (item.enclosure?.url) return item.enclosure.url;
  if (item.mediaContent?.[0]?.$?.url) return item.mediaContent[0].$.url;
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  const html = item["content:encoded"] || item.content || "";
  const match = html.match(/<img[^>]+src="([^">]+)"/);
  return match ? match[1] : null;
}

async function fetchAllFeeds() {
  const results = [];
  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items) {
        results.push({
          title: item.title?.trim() ?? "(untitled)",
          link: item.link,
          source: parsed.title ?? feed.url,
          category: feed.category,
          type: feed.type,
          image: extractImage(item),
          pubDate: item.pubDate ?? item.isoDate ?? null,
          rawSnippet: (item.contentSnippet ?? item.content ?? "").slice(0, 800),
        });
      }
    } catch (err) {
      console.error(`Failed to fetch ${feed.url}:`, err.message);
    }
  }
  return results;
}

// Removes duplicate stories that show up in more than one feed (e.g. the same
// article tagged both "ux" and "product-design" on Medium)
function dedupeByLink(articles) {
  const seenLinks = new Set();
  const out = [];
  for (const a of articles) {
    if (!a.link || seenLinks.has(a.link)) continue;
    seenLinks.add(a.link);
    out.push(a);
  }
  return out;
}

function isRecent(pubDate) {
  if (!pubDate) return true;
  const days = (Date.now() - new Date(pubDate).getTime()) / 86400000;
  return days <= MAX_ARTICLE_AGE_DAYS;
}

// Recency bucket used in place of real "trending" data (RSS feeds don't expose
// claps/likes/shares) — this is what powers the "Trending today" vs "This week"
// sections in the app.
function publishedWindow(pubDate) {
  if (!pubDate) return "week";
  const hours = (Date.now() - new Date(pubDate).getTime()) / 3600000;
  return hours <= 30 ? "today" : "week";
}

async function summarizeBatch(articles) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const prompt = `You write for a UX/tech news digest app meant to be a genuine reference resource for people working in UX, product, and tech — not a casual news feed. Be substantive and specific. No vague filler like "this article explores...". No hype.

For each article below, return an object with:
- "headline": short, punchy, plain-language rewrite of the title (max 10 words).
- "background": 1-2 sentences of context — what situation, debate, or problem this article is responding to. Assume the reader hasn't seen it yet.
- "keyFindings": an array of 2-3 short strings, each a concrete fact, finding, or claim from the piece — specific enough that someone learns something real even without clicking through.
- "implications": 1-2 sentences of practical takeaway or things to note for someone doing UX/product/tech work — caveats, who this applies to, what to do differently.
- "tags": array of 2-3 short specific topic tags (e.g. "Onboarding", "Accessibility", "AI tools") — avoid generic ones like "UX".
- "featured": true for the 1-2 MOST significant/actionable stories in this whole batch, false otherwise. Be selective.

Return ONLY a JSON array, same order as input, no markdown fences, no commentary. Example shape:
[{"headline": "...", "background": "...", "keyFindings": ["...", "..."], "implications": "...", "tags": ["...", "..."], "featured": false}]

Articles:
${articles.map((a, i) => `${i + 1}. Title: ${a.title}\nSnippet: ${a.rawSnippet}`).join("\n\n")}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.content.find((b) => b.type === "text")?.text ?? "[]";
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

async function main() {
  console.log("Fetching feeds...");
  const all = await fetchAllFeeds();
  console.log(`Fetched ${all.length} raw items across ${FEEDS.length} feeds`);

  const deduped = dedupeByLink(all);
  console.log(`${all.length - deduped.length} duplicates removed (same article, multiple feeds)`);

  const seen = await loadSeen();

  const fresh = deduped
    .filter((a) => a.link && !seen.has(a.link))
    .filter((a) => isRecent(a.pubDate))
    .sort((a, b) => new Date(b.pubDate ?? 0) - new Date(a.pubDate ?? 0))
    .slice(0, MAX_ITEMS_PER_DAY);

  if (fresh.length === 0) {
    console.log("No new articles today. Leaving existing digest.json untouched.");
    return;
  }

  console.log(`Summarizing ${fresh.length} new articles...`);
  const summaries = await summarizeBatch(fresh);

  const digestItems = fresh.map((a, i) => ({
    headline: summaries[i]?.headline ?? a.title,
    background: summaries[i]?.background ?? "",
    keyFindings: summaries[i]?.keyFindings ?? [],
    implications: summaries[i]?.implications ?? "",
    tags: summaries[i]?.tags ?? [a.category],
    featured: summaries[i]?.featured ?? false,
    type: a.type,
    publishedWindow: publishedWindow(a.pubDate),
    image: a.image,
    source: a.source,
    link: a.link,
    pubDate: a.pubDate,
  }));

  const digest = {
    generatedAt: new Date().toISOString(),
    items: digestItems,
  };

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(digest, null, 2));
  console.log(`Wrote ${digestItems.length} items to ${OUTPUT_FILE}`);

  fresh.forEach((a) => seen.add(a.link));
  await saveSeen(seen);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
