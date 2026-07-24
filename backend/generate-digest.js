// Daily UX news digest generator.
// 1. Pulls articles from a curated list of UX-focused RSS feeds, including Google
//    News search results for broader industry coverage beyond Medium/NN Group
// 2. Dedupes both by link AND by normalized title (catches the same article
//    republished under a different URL, e.g. Medium tag feed vs a publication's
//    own domain)
// 3. Balances selection so high-volume Medium sources don't crowd out
//    institutional/broader sources
// 4. Skips anything already summarized before (tracked in seen.json)
// 5. Sends new articles to Claude to produce a structured, resource-style summary
// 6. Writes the result to digest.json (what the app reads)
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
      ["source", "gnSource"],
    ],
  },
});

// --- Configure your sources here ---
// "type": "research" -> institutional/broader sources (Trending today / This week)
// "type": "opinion"  -> Medium-based essays, shown in their own Opinions section
// "aggregated": true -> a multi-publisher feed (Google News) where each item's
//   real source comes from the item itself, not the feed title
const FEEDS = [
  { url: "https://www.nngroup.com/feed/rss/", type: "research", category: "Research" },
  { url: "https://www.smashingmagazine.com/feed/", type: "research", category: "Design & dev" },
  { url: "https://alistapart.com/main/feed/", type: "research", category: "Design & dev" },
  {
    url: "https://news.google.com/rss/search?q=UX%20design%20when:7d&hl=en-US&gl=US&ceid=US:en",
    type: "research",
    category: "Industry news",
    aggregated: true,
  },
  {
    url: "https://news.google.com/rss/search?q=UX%20research%20when:7d&hl=en-US&gl=US&ceid=US:en",
    type: "research",
    category: "Industry news",
    aggregated: true,
  },

  { url: "https://medium.com/feed/tag/ux", type: "opinion", category: "UX" },
  { url: "https://medium.com/feed/tag/ux-research", type: "opinion", category: "Research" },
  { url: "https://medium.com/feed/tag/product-design", type: "opinion", category: "Product design" },
  { url: "https://uxdesign.cc/feed", type: "opinion", category: "UX" },
  { url: "https://uxplanet.org/feed", type: "opinion", category: "UX" },
];

const MAX_ITEMS_PER_DAY = 10;
// Reserve most slots for research/institutional/Google News sources so Medium's
// higher publishing volume doesn't dominate the digest by sheer count.
const MAX_RESEARCH_ITEMS = 6;
const MAX_ARTICLE_AGE_DAYS = 7;
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

// Google News titles look like "Headline - Publisher Name"
function extractGoogleNewsSource(item) {
  if (item.gnSource) return item.gnSource;
  const parts = item.title?.split(" - ");
  return parts && parts.length > 1 ? parts[parts.length - 1].trim() : "Google News";
}

function cleanGoogleNewsTitle(title) {
  const parts = title?.split(" - ");
  return parts && parts.length > 1 ? parts.slice(0, -1).join(" - ").trim() : title;
}

async function fetchAllFeeds() {
  const results = [];
  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items) {
        const title = feed.aggregated ? cleanGoogleNewsTitle(item.title) : item.title?.trim();
        results.push({
          title: title ?? "(untitled)",
          link: item.link,
          source: feed.aggregated ? extractGoogleNewsSource(item) : parsed.title ?? feed.url,
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

function normalizeTitle(title) {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Removes duplicate stories that show up in more than one feed — either the
// exact same link, or the same article republished under a different URL
// (e.g. tagged on Medium AND cross-posted to a publication's own domain).
function dedupe(articles) {
  const seenLinks = new Set();
  const seenTitles = new Set();
  const out = [];
  for (const a of articles) {
    if (!a.link || seenLinks.has(a.link)) continue;
    const normTitle = normalizeTitle(a.title);
    if (normTitle && seenTitles.has(normTitle)) continue;
    seenLinks.add(a.link);
    if (normTitle) seenTitles.add(normTitle);
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
// claps/likes/shares) — this powers the "Trending today" vs "This week" sections.
function publishedWindow(pubDate) {
  if (!pubDate) return "week";
  const hours = (Date.now() - new Date(pubDate).getTime()) / 3600000;
  return hours <= 30 ? "today" : "week";
}

// Guarantees research/institutional/Google News sources get most of the slots,
// regardless of how many more Medium posts exist in the candidate pool.
function selectBalanced(candidates) {
  const sorted = [...candidates].sort((a, b) => new Date(b.pubDate ?? 0) - new Date(a.pubDate ?? 0));
  const research = sorted.filter((a) => a.type !== "opinion").slice(0, MAX_RESEARCH_ITEMS);
  const remainingSlots = MAX_ITEMS_PER_DAY - research.length;
  const opinion = sorted.filter((a) => a.type === "opinion").slice(0, Math.max(0, remainingSlots));
  return [...research, ...opinion].sort((a, b) => new Date(b.pubDate ?? 0) - new Date(a.pubDate ?? 0));
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

  const deduped = dedupe(all);
  console.log(`${all.length - deduped.length} duplicates removed (same link or same title, different feed)`);

  const seen = await loadSeen();

  const candidates = deduped.filter((a) => a.link && !seen.has(a.link)).filter((a) => isRecent(a.pubDate));

  const fresh = selectBalanced(candidates);

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
    category: a.category,
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
