# Living captures

Small daily tests that capture something new every day, published at
https://anglnmonica.github.io/living-captures/.

Each morning, GitHub Actions runs [`scripts/capture.mjs`](scripts/capture.mjs)
to fetch today's data, then [Doc Detective](https://github.com/doc-detective/doc-detective)
checks every source and the published page. Each card on the page shows the
test that checked it, and whether it passed.

| Capture | Source | Test |
| --- | --- | --- |
| Berkeley weather, and what to wear | [National Weather Service API](https://www.weather.gov/documentation/services-web-api) | `weather-source`: Berkeley's forecast comes from the Bay Area office (MTR) |
| NASA's astronomy picture of the day | [NASA APOD API](https://api.nasa.gov/), or the [APOD page](https://science.nasa.gov/apod/) when the API fails | `apod-source`: the APOD page answers |
| Status of the tools I use | GitHub, Anthropic, and npm status pages | `status-github`, `status-anthropic`, `status-npm`: each reports no problems |
| New documentation tools on GitHub | [GitHub search API](https://docs.github.com/en/rest/search) | `docs-tools-source`: the search answers |
| German word of the day | [`site/data/german-words.json`](site/data/german-words.json), a list kept in this repository | `page-shows-captures`: the page shows every capture |

## What a failing test means

Not every red result is a bug:

- **A status test fails** when that tool reports an incident. That's the
  capture working: it shows the day's problem.
- **A source test fails** when that site's API didn't answer or changed what
  it returns. The page shows the last error instead of that capture.
- **`page-shows-captures` fails** when the page itself is broken. That's the
  one to fix.

## How it runs

The [Capture today](.github/workflows/capture.yml) workflow runs every day at
13:23 UTC, on every push to `main`, and when started by hand from the Actions
tab. It doesn't commit anything: each run publishes a fresh copy of the site to
GitHub Pages, so the history stays clean.

To use your own NASA API key instead of the shared demo key, get a free key at
https://api.nasa.gov/, then add it as a repository secret named
`NASA_API_KEY`.

## Run it on your computer

You need Node.js 22 or later.

```bash
node scripts/capture.mjs
python3 -m http.server 8000 --directory site &
npx doc-detective@4 --config .doc-detective.json --input tests --output results -r terminal -r runFolder
node scripts/results.mjs results
```

Then open http://localhost:8000.

## Change the German word list

Add or edit entries in `site/data/german-words.json`. Each entry has a
`word` with its article, its `english` meaning, and an `example` sentence with
its `exampleEnglish` translation. The page picks a new word each day.
