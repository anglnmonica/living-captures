// Fills each card from the JSON that this morning's run saved in data/.
// Every value is set as text, never as HTML, because it comes from other sites.

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

async function load(name) {
  try {
    const res = await fetch(`data/${name}.json`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function fill(id, ...nodes) {
  $(`#${id} .body`).replaceChildren(...nodes);
}

function failed(id, what, data) {
  fill(
    id,
    el("p", { class: "error" }, data && data.error ? `This morning's ${what} couldn't be fetched: ${data.error}` : `There's no ${what} yet. It appears after the first run.`),
  );
}

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" });
const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

// ---------------------------------------------------------------------------
// What to wear, from the next daytime forecast
// ---------------------------------------------------------------------------
function whatToWear(day) {
  const t = day.temperature;
  const lines = [];
  if (t >= 80) lines.push("Wear a T-shirt.");
  else if (t >= 68) lines.push("Wear light layers.");
  else if (t >= 58) lines.push("Wear a sweater or light jacket.");
  else if (t >= 48) lines.push("Wear a warm jacket.");
  else lines.push("Wear a coat, and maybe a hat.");

  const rain = day.rainChance || 0;
  if (rain >= 40) lines.push("Take an umbrella.");
  else if (rain >= 20) lines.push("Bring a hood, just in case.");

  // windSpeed is text, such as "5 to 15 mph": use the highest number in it.
  const wind = Math.max(...(String(day.windSpeed).match(/\d+/g) || ["0"]).map(Number));
  if (wind >= 15) lines.push("Add something windproof.");
  return lines.join(" ");
}

async function weather() {
  const d = await load("weather");
  if (!d || !d.ok) return failed("weather", "forecast", d);
  const day = d.periods.find((p) => p.isDaytime) || d.periods[0];
  fill(
    "weather",
    el("div", { class: "now" },
      el("span", { class: "temp" }, `${day.temperature}°${day.unit}`),
      el("span", { class: "cond" }, `${day.name}: ${day.shortForecast}`)),
    el("p", { class: "wear" }, el("strong", {}, "What to wear"), whatToWear(day)),
    el("ul", { class: "periods" },
      ...d.periods.map((p) =>
        el("li", {}, el("b", {}, p.name), `${p.temperature}°${p.unit} · ${p.rainChance || 0}% rain · ${p.shortForecast}`))),
  );
}

// ---------------------------------------------------------------------------
// German word of the day: picked from our own list by the date in California
// ---------------------------------------------------------------------------
async function german() {
  const words = await load("german-words");
  if (!Array.isArray(words) || !words.length) return failed("german", "word list", null);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const dayNumber = Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86400000);
  const w = words[dayNumber % words.length];
  fill(
    "german",
    el("p", { class: "word", lang: "de" }, w.word),
    el("p", { class: "meaning" }, w.english),
    el("blockquote", { class: "example" },
      el("p", { lang: "de" }, w.example),
      el("p", { class: "en" }, w.exampleEnglish)),
  );
}

// ---------------------------------------------------------------------------
// NASA Astronomy Picture of the Day
// ---------------------------------------------------------------------------
async function apod() {
  const a = await load("apod");
  if (!a || !a.ok) return failed("apod", "picture", a);
  const image = a.mediaType === "image" ? a.url : a.thumbnail;
  const visual = image
    ? el("a", { href: a.hdurl || a.url }, el("img", { src: image, alt: a.title, loading: "lazy" }))
    : el("p", {}, el("a", { href: a.url }, a.mediaType === "video" ? "Today's entry is a video. Watch it on NASA's site." : "Today's entry isn't a still image. See it on NASA's site."));
  fill(
    "apod",
    el("div", { class: "apod" },
      visual,
      el("div", {},
        el("h3", {}, a.title),
        el("p", { class: "credit" }, `${a.date}${a.copyright ? ` · Image credit: ${a.copyright}` : ""} · `, el("a", { href: a.source }, "View on APOD")),
        el("div", { class: "text" }, el("p", {}, a.explanation)))),
  );
}

// ---------------------------------------------------------------------------
// Tool status
// ---------------------------------------------------------------------------
async function status() {
  const s = await load("status");
  if (!s || !s.ok) return failed("status", "status check", s);
  fill(
    "status",
    el("ul", { class: "tools" },
      ...s.tools.map((t) =>
        el("li", {},
          el("span", { class: `dot ${t.indicator}`, "aria-hidden": "true" }),
          el("span", {}, el("a", { href: t.page }, t.name), " ", el("span", { class: "desc" }, t.description))))),
  );
}

// ---------------------------------------------------------------------------
// New documentation tools on GitHub
// ---------------------------------------------------------------------------
async function docsTools() {
  const g = await load("docs-tools");
  if (!g || !g.ok) return failed("docs-tools", "list", g);
  if (!g.repos.length) {
    return fill("docs-tools", el("p", { class: "empty" }, `No new repositories tagged documentation since ${g.since}.`));
  }
  fill(
    "docs-tools",
    el("p", { class: "empty" }, `The most-starred repositories tagged documentation, created since ${g.since}:`),
    el("ol", { class: "repos" },
      ...g.repos.map((r) =>
        el("li", {},
          el("a", { href: r.url }, r.name),
          " ",
          el("span", { class: "meta" }, `★ ${r.stars}${r.language ? ` · ${r.language}` : ""}`),
          r.description ? el("p", {}, r.description) : null))),
  );
}

// ---------------------------------------------------------------------------
// Test receipts and the run summary
// ---------------------------------------------------------------------------
async function receipts() {
  const r = await load("results");
  const spec = (id) => `https://github.com/anglnmonica/living-captures/blob/main/tests/${id.startsWith("page") ? "page" : "sources"}.spec.json`;
  document.querySelectorAll(".receipt").forEach((p) => {
    const ids = p.dataset.tests.split(" ");
    p.replaceChildren(
      el("span", {}, "Checked by Doc Detective:"),
      ...ids.map((id) => {
        const result = r && r.tests[id] ? r.tests[id].result : "NOT RUN";
        return el("span", { class: `r r-${result.replace(/\s/g, "")}` }, el("a", { href: spec(id) }, id), ` ${result}`);
      }),
    );
  });

  const run = $("#run");
  if (!r) {
    run.textContent = "No run yet. The first run fills in this page.";
    return;
  }
  const all = Object.values(r.tests);
  const passed = all.filter((t) => t.result === "PASS").length;
  run.replaceChildren(
    `This morning's run, ${timeFmt.format(new Date(r.runAt))}: ${passed} of ${all.length} tests passed. `,
    r.runUrl ? el("a", { href: r.runUrl }, "See the run") : "",
  );
}

$("#today").textContent = dateFmt.format(new Date());
weather();
german();
apod();
status();
docsTools();
receipts();
