// Daily UX news digest generator.
// 1. Pulls articles from a curated list of UX-focused RSS feeds
// 2. Skips anything already summarized before (tracked in seen.json)
// 3. Sends new articles to Claude to produce short, plain-language summaries
// 4. Writes the result to digest.json (what the app reads)
//
// Run with: ANTHROPIC_API_KEY=sk-... node generate-digest.js

import Parser from "rss-parser";
import fs from "fs/promises";
import path from "path";

const parser = new Parser({ timeout: 10000 });

// --- Configure your sources here ---
// Add/remove feeds freely. "category" is shown as a small tag in the app.
const FEEDS = [
  { url: "https://medium.com/feed/tag/ux", category: "UX" },
  { url: "https://medium.com/feed/tag/ux-research", category: "Research" },
  { url: "https://medium.com/feed/tag/product-design", category: "Product design" },
  { url: "https://www.nngroup.com/feed/rss/", category: "Research" },
  { url: "https://www.smashingmagazine.com/feed/", category: "Design & dev" },
  { url: "https://uxdesign.cc/feed", category: "UX" },
  { url: "https://alistapart.com/main/feed/", category: "Design & dev" },
];

const MAX_ITEMS_PER_DAY = 8; // keep it short — "not overwhelming"
const MAX_ARTICLE_AGE_DAYS = 3; // ignore anything older than this
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
  // keep the file from growing forever — only remember the last 500 links
  const arr = Array.from(seenSet).slice(-500);
  await fs.writeFile(SEEN_FILE, JSON.stringify(arr, null, 2));
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
          pubDate: item.pubDate ?? item.isoDate ?? null,
          rawSnippet: (item.contentSnippet ?? item.content ?? "").slice(0, 600),
        });
      }
    } catch (err) {
      console.error(`Failed to fetch ${feed.url}:`, err.message);
    }
  }
  return results;
}

function isRecent(pubDate) {
  if (!pubDate) return true; // if unknown, don't discard it
  const days = (Date.now() - new Date(pubDate).getTime()) / 86400000;
  return days <= MAX_ARTICLE_AGE_DAYS;
}

async function summarizeBatch(articles) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const prompt = `You write for a UX news digest app whose entire purpose is being EXTREMELY clear, accessible, and not overwhelming. No jargon without a plain explanation. No hype.

For each article below, return an object with:
- "summary": 2-3 short sentences in plain English explaining what it's about and why a UX practitioner would care. Assume the reader is busy and non-expert-friendly.
- "headline": a short, punchy, plain-language rewrite of the title (max 12 words)

Return ONLY a JSON array, same order as input, no markdown fences, no commentary. Example shape:
[{"summary": "...", "headline": "..."}]

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
      max_tokens: 2000,
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
  console.log(`Fetched ${all.length} total items across ${FEEDS.length} feeds`);

  const seen = await loadSeen();

  const fresh = all
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
    summary: summaries[i]?.summary ?? "",
    source: a.source,
    category: a.category,
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
