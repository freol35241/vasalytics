# Scraper Performance Investigation & CI Year Filtering

## Performance Investigation

### Current Architecture

The scraper has three layers:
1. **Providers** discover events via REST API calls
2. **Spider** (`MikaTimingSpider`) crawls individual participant detail pages
3. **Orchestrator** runs one spider per event, sequentially, each in its own subprocess

### Identified Bottlenecks

#### 1. Detail-page crawling pattern (BIGGEST bottleneck)
The spider visits **individual HTML detail pages** for every participant:
- Starts at the event list page (`?event={id}&pid=list`)
- Follows pagination links to discover all result pages
- On each page, follows `?content=detail` links to **individual participant pages**
- Parses splits from each detail page's HTML

For a large event (e.g., Göteborgsvarvet with ~46,660 participants):
- 1869 pagination pages (25 per page) + ~46,660 detail pages = **~48,529 HTTP requests per event**
- At 16 concurrent requests and ~0.7s/request → **~35 minutes per large event**

#### 2. Sequential event processing
Events are processed one at a time (`run_scraper.py:111-116`). Each event spawns a new subprocess, starts a fresh Python interpreter, initializes Scrapy, and runs the crawler. There is no parallelism across events.

#### 3. Subprocess-per-event overhead
Each event requires a full `multiprocessing.Process` with:
- Python interpreter startup
- Scrapy/Twisted reactor initialization
- CrawlerProcess setup
This is done to work around Twisted's reactor not being restartable, but adds significant overhead per event.

#### 4. Scale of data
- Vasaloppet: 102 years x multiple events/year = 618 event files
- Göteborgsvarvet: 15 years = 75 event files
- Total: 693 event files (already scraped, but any new/corrupted triggers re-scrape)

---

## AJAX API Investigation Results

### Discovery: Mika Timing `getPersonTimes` Bulk API

By reverse-engineering the Mika Timing JavaScript (`Requester.js`, `Board.js`, `list.js`),
the following AJAX endpoint was identified:

**Endpoint:** `POST {base_url}/index.php?content=ajax2&func=getPersonTimes&onpage=list`

**Request body (form-encoded):**
```
options[option_bar][event]={event_id}
options[person_ids][0]={participant_id_1}
options[person_ids][1]={participant_id_2}
...
```

**Response:** JSON with rich split data per participant:
```json
{
  "detail_fields": {...},
  "data": [
    {
      "__fullname": "Suldan Hassan",
      "start_no_text": "1",
      "start_group": "1. Elit Herr",
      "_type_age_class": "...",
      "splits": [
        {"name": "5 km", "time": "00:15:05", "min_km": "03:01", "time_ms": 904295},
        {"name": "Finish", "time": "01:03:39", "min_km": "02:47", "time_ms": 3818433}
      ]
    }
  ]
}
```

### Benchmarks

| Operation | Requests | Time | Notes |
|-----------|----------|------|-------|
| Detail page (1 participant) | 1 | ~0.7s | Current approach: one page per person |
| `getPersonTimes` (25 IDs) | 1 | 1.5s | 25 participants' full splits in one call |
| List page (100 IDs via `num_results=100`) | 1 | ~1.6s | Extracts participant IDs via regex |

### Data Accuracy Comparison (Göteborgsvarvet, bib #1 Suldan Hassan)

| Split | Scraped (current) | API (`getPersonTimes`) | Diff |
|-------|-------------------|------------------------|------|
| 5 km time | 905s | 904s | ~1s (ms rounding) |
| 5 km pace | 3.017 | 3.017 | exact |
| Finish time | 3819s | 3818s | ~1s (ms rounding) |
| Finish pace | 2.783 | 2.783 | exact |

The API returns millisecond-precision times (`time_ms`). Current scraper rounds HH:MM:SS to seconds. The API data is actually **more precise**.

### Provider Compatibility

| Provider | `getPersonTimes` works? | Notes |
|----------|------------------------|-------|
| Göteborgsvarvet | YES | Full split data returned, no auth needed |
| Vasaloppet | NO | Returns 200 but empty `data: []`. Self-hosted instance may restrict this endpoint |

### Participant ID Discovery

List page with `num_results=100` parameter returns 100 participant IDs per page (max supported).
IDs are extracted via regex from detail links: `content=detail.*?idp=([^&"]+)`

Supported by both providers.

---

## Proposed Implementation Plan

### Phase 1: Replace Scrapy with `requests`-based scraper (HIGH impact)

Replace `MikaTimingSpider` (Scrapy CrawlSpider) with a plain `requests`-based approach:

**For Göteborgsvarvet (bulk API available):**
1. Fetch list pages with `num_results=100` to collect all participant IDs
2. Batch-call `getPersonTimes` with up to 100 IDs per request
3. Transform JSON response into the existing output format

**Request reduction:** From ~48,529 to ~934 requests per event (~52x fewer)

**For Vasaloppet (bulk API not available):**
1. Fetch list pages with `num_results=100` to collect all participant IDs
2. Fetch detail pages in parallel using `concurrent.futures.ThreadPoolExecutor`
3. Parse HTML with existing CSS selector logic (reuse from `MikaTimingSpider`)

**Speedup:** Parallel detail page fetching (e.g., 20 concurrent threads) → ~20x faster

### Phase 2: Drop Scrapy dependency

Once both providers use `requests` + optional threading:
- Remove `scrapy` from `requirements.txt`
- Remove `mikatiming_spider.py`
- Remove `multiprocessing.Process` subprocess workaround from orchestrator
- Simpler, faster, fewer dependencies

### Phase 3: Parallel event processing (optional, MEDIUM impact)

Use `concurrent.futures.ThreadPoolExecutor` in the orchestrator to process multiple events simultaneously. Most useful for initial backfill.

---

## CI Pipeline Change (IMPLEMENTED)

- **`scraper/run_scraper.py`**: Added `--years` CLI argument to filter events by year.
- **`.github/workflows/run_scraper.yml`**: CI computes `LAST_FULL_YEAR=$(date -d "last year" +%Y)` and passes `--years $LAST_FULL_YEAR`.
- Manual runs without `--years` scrape all years (for backfilling).
