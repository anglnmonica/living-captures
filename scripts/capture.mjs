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

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers } });
  if (!res.ok) throw new Error(`${url} answered ${res.status} ${res.statusText}`);
  return res.json();
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
await capture("apod", async () => {
  const key = process.env.NASA_API_KEY || "DEMO_KEY";
  const a = await getJson(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}`);
  return {
    date: a.date,
    title: a.title,
    explanation: a.explanation,
    mediaType: a.media_type,
    url: a.url,
    hdurl: a.hdurl || null,
    thumbnail: a.thumbnail_url || null,
    copyright: a.copyright ? a.copyright.trim() : null,
    source: `https://apod.nasa.gov/apod/ap${a.date.slice(2).replace(/-/g, "")}.html`,
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
