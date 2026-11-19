#!/usr/bin/env node
// Fetches today's data for each capture and saves it to site/data/.
//
// Each capture is independent: if one source is down, the others still
// update, and the failed one records what went wrong so the page can say so.
// The Doc Detective tests in tests/ then check the sources and the page.
//
// Run: node scripts/capture.mjs
// Optional environment variables:
//   NASA_API_KEY  A free key from api.nasa.gov. Defaults to DEMO_KEY.
//   GITHUB_TOKEN  Raises GitHub's search rate limit. GitHub Actions sets it.

import fs from "node:fs";
import path from "node:path";

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "site", "data");
const UA = "living-captures (https://github.com/anglnmonica/living-captures)";

// Berkeley, California
const BERKELEY = { lat: 37.8716, lon: -122.2727 };

// Retries a server error (5xx) up to three times, a few seconds apart, since
// some APIs, such as NASA's, fail now and then and answer on the next try.
async function getJson(url, headers = {}, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers } });
    if (res.ok) return res.json();
    if (res.status < 500 || attempt >= tries) {
      const shown = url.replace(/api_key=[^&]+/, "api_key=…");
      throw new Error(`${shown} answered ${res.status} ${res.statusText}`);
    }
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
}

function save(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
}

async function capture(name, fn) {
  const fetchedAt = new Date().toISOString();
  try {
    save(name, { ok: true, fetchedAt, ...(await fn()) });
    console.log(`${name}: captured`);
  } catch (err) {
    save(name, { ok: false, fetchedAt, error: String(err.message || err) });
    console.log(`${name}: FAILED, ${err.message || err}`);
  }
}

// ---------------------------------------------------------------------------
// Berkeley weather, from the National Weather Service
// ---------------------------------------------------------------------------
await capture("weather", async () => {
  // The points endpoint returns the forecast address for a location, so
  // nothing about the forecast grid is hard-coded.
  const point = await getJson(`https://api.weather.gov/points/${BERKELEY.lat},${BERKELEY.lon}`, { Accept: "application/geo+json" });
  const forecast = await getJson(point.properties.forecast, { Accept: "application/geo+json" });
  const periods = forecast.properties.periods.slice(0, 4).map((p) => ({
    name: p.name,
    isDaytime: p.isDaytime,
    temperature: p.temperature,
    unit: p.temperatureUnit,
    rainChance: p.probabilityOfPrecipitation?.value ?? 0,
    windSpeed: p.windSpeed,
    shortForecast: p.shortForecast,
    detailedForecast: p.detailedForecast,
  }));
  return {
    place: `${point.properties.relativeLocation.properties.city}, ${point.properties.relativeLocation.properties.state}`,
    source: "https://www.weather.gov/",
    periods,
  };
});

// ---------------------------------------------------------------------------
// NASA Astronomy Picture of the Day
// ---------------------------------------------------------------------------
const APOD_PAGE = "https://science.nasa.gov/apod/";
// Browsers block http:// images on an https:// page, so ask for https.
const https = (u) => (u ? u.replace(/^http:\/\//, "https://") : null);

// NASA's APOD API fails now and then. When it does, read today's APOD page
// on NASA Science instead. Its pictures are stored by year and month, such as
// .../cds/apod/apod/2026/november/Horsehead_Nebula.jpg, which tells today's
// picture apart from logos and promotions. (The page's og:image preview tag
// isn't today's picture, so it isn't used.)
async function apodFromPage() {
  const res = await fetch(APOD_PAGE, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${APOD_PAGE} answered ${res.status} ${res.statusText}`);
  const html = await res.text();
  const strip = (t) => t.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;/g, "’").replace(/\s+/g, " ").trim();

  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "America/New_York" }).format(new Date()).toLowerCase();
  const found = [...html.matchAll(/https?:\/\/[^"'\s<>]*\/cds\/apod\/apod\/(\d{4})\/([a-z]+)\/[^"'\s<>?]+\.(?:jpe?g|png|gif|webp)/gi)]
    .map((m) => ({ url: m[0], month: m[2].toLowerCase() }))
    .filter((m) => !/annotated/i.test(m.url));
  console.log(`apod: page has ${found.length} APOD pictures: ${[...new Set(found.map((f) => f.url))].slice(0, 4).join(", ")}`);
  const pick = found.find((f) => f.month === month) || found[0];
  const video = html.match(/<iframe[^>]+src\s*=\s*["']([^"']*(?:youtube|vimeo)[^"']*)["']/i);
  if (!pick && !video) throw new Error("The APOD page has no picture or video that the capture recognizes.");

  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1])).find((t) => t && !/^(astronomy picture of the day|apod)$/i.test(t));
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const base = pick ? pick.url.replace(/\/dynamicimage\//, "/dynamicimage/") : null;
  return {
    date,
    title: h1 || "Today's astronomy picture",
    explanation: "",
    mediaType: pick ? "image" : "video",
    // The dynamic image service resizes on request; 1600 pixels wide is plenty.
    url: pick ? https(`${base}?w=1600&fit=clip`) : https(video[1]),
    hdurl: pick ? https(base) : null,
    thumbnail: null,
    copyright: null,
    source: APOD_PAGE,
    from: "page",
  };
}

await capture("apod", async () => {
  const key = process.env.NASA_API_KEY || "DEMO_KEY";
  let a;
  try {
    // thumbs=true asks for a preview image when today's entry is a video.
    a = await getJson(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}&thumbs=true`);
  } catch (err) {
    console.log(`apod: the API failed (${err.message}), so reading the APOD page instead`);
    const p = await apodFromPage();
    console.log(`apod: from the page: ${p.date}, ${p.mediaType}, ${p.url}`);
    return p;
  }
  console.log(`apod: ${a.date}, ${a.media_type}, ${a.url}${a.thumbnail_url ? `, thumbnail ${a.thumbnail_url}` : ""}`);
  return {
    date: a.date,
    title: a.title,
    explanation: a.explanation,
    mediaType: a.media_type,
    url: https(a.url),
    hdurl: https(a.hdurl),
    thumbnail: https(a.thumbnail_url),
    copyright: a.copyright ? a.copyright.trim() : null,
    source: APOD_PAGE,
    from: "api",
  };
});

// ---------------------------------------------------------------------------
// Status of the tools this portfolio runs on
// ---------------------------------------------------------------------------
await capture("status", async () => {
  const pages = [
    { name: "GitHub", api: "https://www.githubstatus.com/api/v2/status.json", page: "https://www.githubstatus.com/" },
    { name: "Anthropic (Claude)", api: "https://status.anthropic.com/api/v2/status.json", page: "https://status.anthropic.com/" },
    { name: "npm", api: "https://status.npmjs.org/api/v2/status.json", page: "https://status.npmjs.org/" },
  ];
  const tools = [];
  for (const p of pages) {
    try {
      const s = await getJson(p.api);
      // indicator is none, minor, major, or critical
      tools.push({ name: p.name, page: p.page, indicator: s.status.indicator, description: s.status.description });
    } catch (err) {
      tools.push({ name: p.name, page: p.page, indicator: "unknown", description: "The status page didn't answer." });
    }
  }
  return { tools };
});

// ---------------------------------------------------------------------------
// New documentation tools on GitHub this week
// ---------------------------------------------------------------------------
await capture("docs-tools", async () => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const q = encodeURIComponent(`topic:documentation created:>=${since}`);
  const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const r = await getJson(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=8`, headers);
  return {
    since,
    total: r.total_count,
    repos: r.items.map((i) => ({
      name: i.full_name,
      url: i.html_url,
      description: i.description,
      stars: i.stargazers_count,
      language: i.language,
    })),
  };
});
