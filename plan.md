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

For a large event (e.g., Vasaloppet with ~15,000 participants):
- ~150 pagination pages + ~15,000 detail pages = **~15,150 HTTP requests per event**
- At 16 concurrent requests and ~500ms/request → **~8 minutes per large event**

#### 2. Sequential event processing
Events are processed one at a time (`run_scraper.py:111-116`). Each event spawns a new subprocess, starts a fresh Python interpreter, initializes Scrapy, and runs the crawler. There is no parallelism across events.

#### 3. Subprocess-per-event overhead
Each event requires a full `multiprocessing.Process` with:
- Python interpreter startup
- Scrapy/Twisted reactor initialization
- CrawlerProcess setup
This is done to work around Twisted's reactor not being restartable, but adds significant overhead per event.

#### 4. Scale of data
- Vasaloppet: 102 years × multiple events/year = 618 event files
- Göteborgsvarvet: 15 years = 75 event files
- Total: 693 event files (already scraped, but any new/corrupted triggers re-scrape)

### Proposed Optimizations (ordered by impact)

#### A. Replace detail-page crawling with Mika Timing bulk/AJAX API (HIGH impact)
The Mika Timing platform exposes AJAX endpoints (the same ones used for event discovery). There is likely a search/results endpoint that returns participant data in bulk JSON format, avoiding the need to visit 15,000+ individual HTML pages. This would reduce HTTP requests from ~15,150 to potentially ~150 (paginated API calls) per event — a **~100x reduction**.

Investigation needed: Probe the Mika Timing AJAX API for a bulk results endpoint (e.g., `?content=ajax2&func=getSearchResults`).

#### B. Parallel event processing (MEDIUM impact)
Use `concurrent.futures.ProcessPoolExecutor` with a configurable worker count to scrape multiple events simultaneously. This would provide a linear speedup proportional to worker count (e.g., 4 workers → ~4x faster).

#### C. Batch events into single CrawlerProcess (MEDIUM impact)
Instead of one subprocess per event, batch multiple events into a single CrawlerProcess run. Scrapy supports crawling multiple spiders in one process, reducing interpreter/reactor startup overhead.

#### D. Tune Scrapy concurrency settings (LOW impact)
Add `CONCURRENT_REQUESTS`, `CONCURRENT_REQUESTS_PER_DOMAIN`, and `DOWNLOAD_DELAY` settings. Currently using Scrapy defaults (16 concurrent requests). Could increase for non-rate-limited targets, or add polite delays to avoid being blocked.

## CI Pipeline Change

### Implementation Plan

1. Add `--years` CLI argument to `run_scraper.py` to filter which years to scrape
2. When `--years` is provided, filter discovered events to only include matching years
3. Update CI workflow to pass `--years <last_full_year>` (currently 2025)
4. Manual/local runs without `--years` continue to scrape all available years (for backfilling)
