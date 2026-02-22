# Multi-Provider Architecture Investigation

## Background

The `generalization-trial-1` branch (commit `1e49abd`, message: *"Possible dead end, not a nice code structure..."*) attempted to generalize the scraper architecture so that multiple data event providers could be supported — not just `results.vasaloppet.se`. This document analyzes what was tried, why it was abandoned, and proposes a way forward.

---

## Current Architecture (master)

The current system is a tightly coupled, single-provider pipeline:

```
results.vasaloppet.se API
        │
        ▼
  run_scraper.py          ← Orchestrator: discovers years/events, manages index
        │
        ▼
  vasa_spider.py          ← Scrapy spider: crawls pages, extracts participant data
        │
        ▼
  data/events/{year}/{event_id}.json   ← Output: one file per event
  data/index.json                      ← Master index: {year: {event_id: name}}
        │
        ▼
  app/main.py (Streamlit) ← Frontend: reads index → loads event → visualizes
```

**Key observations about the current design:**

1. **Orchestration lives in `run_scraper.py`** — it calls the vasaloppet.se API directly to discover years and events, decides what needs scraping, manages the index file, and spawns the spider in subprocesses.
2. **The spider (`vasa_spider.py`) is stateless** — it receives a single `event_id`, crawls its pages, and yields items. It knows nothing about years, indexing, or file output.
3. **Data output is handled by Scrapy's FEEDS mechanism** — the orchestrator sets up `FEEDS` settings pointing to specific file paths.
4. **The frontend hardcodes the data path structure** — `API_ROOT/events/{year}/{event_id}.json`.

---

## What the `generalization-trial-1` Branch Changed

The branch made four significant changes:

### 1. Moved discovery logic into the spider

`get_years()` and `get_events()` were moved from `run_scraper.py` into `vasa_spider.py`. The spider's `start_requests()` method now iterates over all years and events, yielding `Request` objects with metadata:

```python
class Vasaloppet(CrawlSpider):
    def start_requests(self):
        for year in get_years():
            events = get_events(year)
            for event_id, event_name in events.items():
                identifier = (MAIN_EVENT, year, event_id)
                yield Request(
                    f"https://results.vasaloppet.se/?event={event_id}&pid=list",
                    meta={"identifier": identifier},
                )
```

### 2. Introduced metadata propagation via `identifier`

A tuple `(MAIN_EVENT, year, event_id)` — e.g. `("Vasaloppet", "2024", "VL_xxx")` — is attached to each request's `meta` and forwarded through all subsequent requests (pagination, detail pages) using a `forward_metadata` helper and `process_request` callbacks on the `Rule` objects.

### 3. Replaced Scrapy FEEDS with a custom Item Pipeline

A new `ExportItemsPerEvent` pipeline class distributes items into files based on their `identifier`:

```python
class ExportItemsPerEvent:
    def _exporter_for_item(self, item):
        identifier = item["identifier"]   # ("Vasaloppet", "2024", "VL_xxx")
        path = Path("data") / "/".join(identifier) + ".json"
        # Creates: data/Vasaloppet/2024/VL_xxx.json
```

### 4. Simplified the orchestrator

`run_scraper.py` became trivial — just configure and start the `CrawlerProcess`. No more subprocess spawning, no more index management, no year/event discovery.

### What was extracted to `utils.py`

The time/pace conversion functions were moved to a shared `utils.py`, along with the `forward_metadata` helper.

---

## Why It Was Abandoned

The commit message says *"Possible dead end, not a nice code structure..."* — and there are real architectural problems:

### Problem 1: Too much responsibility in the spider

The spider now handles discovery, index management, metadata propagation, **and** crawling. The `start_requests()` method reads and writes `index.json`, calls external APIs synchronously (via `requests`), and iterates over every year/event pair. This violates the single-responsibility principle and makes the spider hard to test and reuse.

### Problem 2: Synchronous blocking in an async context

`get_years()` and `get_events()` use the synchronous `requests` library inside `start_requests()`. Scrapy runs on Twisted's event loop — blocking calls here stall the entire reactor. This works for a single provider but would become a real bottleneck with multiple providers.

### Problem 3: Index management became fragmented

The index is now updated inside `start_requests()` *before* any data is actually scraped. If scraping fails for an event, the index still claims it exists. The current master branch correctly updates the index only after successful scraping and data validation.

### Problem 4: No actual multi-provider abstraction

Despite the `MAIN_EVENT = "Vasaloppet"` constant and the `identifier` tuple, there's no interface or base class that a second provider could implement. Adding another provider would mean writing another spider with the same boilerplate for discovery, index management, metadata propagation, etc.

### Problem 5: Data path structure change breaks the frontend

The new path structure (`data/Vasaloppet/2024/VL_xxx.json`) differs from the current one (`data/events/2024/VL_xxx.json`). The frontend (`app/main.py`) and GitHub Pages deployment would need updating.

### Problem 6: Loss of incremental scraping safeguards

The master branch has `has_valid_data()` checks, deduplication of cross-season events, cleanup of empty files, and subprocess isolation for the Twisted reactor. The generalization branch lost all of these.

---

## Proposed Way Forward

The goal is to support multiple event data providers (e.g., other ski races, running events, cycling events) while keeping the architecture clean. Here's a layered approach:

### Layer 1: Provider Interface

Define a clear contract that each provider must implement:

```python
# scraper/providers/base.py

from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class EventInfo:
    provider: str       # e.g. "vasaloppet"
    year: str           # e.g. "2024"
    event_id: str       # e.g. "VL_HCH8NDMR2500"
    event_name: str     # e.g. "Vasaloppet"

class BaseProvider(ABC):
    """Interface for a data event provider."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique provider identifier, used in data paths."""
        ...

    @abstractmethod
    def discover_events(self) -> list[EventInfo]:
        """Return all events available from this provider."""
        ...

    @abstractmethod
    def create_spider_cls(self) -> type:
        """Return the Scrapy spider class for this provider."""
        ...

    @abstractmethod
    def spider_kwargs(self, event: EventInfo) -> dict:
        """Return kwargs to pass to the spider constructor for a given event."""
        ...
```

### Layer 2: Vasaloppet Provider

Wrap the existing logic into this interface:

```python
# scraper/providers/vasaloppet.py

class VasaloppetProvider(BaseProvider):
    name = "vasaloppet"

    def discover_events(self) -> list[EventInfo]:
        events = []
        for year in get_years():
            for event_id, event_name in get_events(year).items():
                events.append(EventInfo("vasaloppet", year, event_id, event_name))
        return events

    def create_spider_cls(self):
        return MikaTimingSpider   # The existing spider, unchanged

    def spider_kwargs(self, event):
        return {"event_id": event.event_id}
```

The existing `MikaTimingSpider` stays almost exactly as-is — it already takes an `event_id` and knows how to crawl `results.vasaloppet.se`.

### Layer 3: Orchestrator Refactor

`run_scraper.py` becomes provider-agnostic:

```python
# scraper/run_scraper.py

from providers.vasaloppet import VasaloppetProvider
# Future: from providers.birkebeiner import BirkebeinerProvider

PROVIDERS = [
    VasaloppetProvider(),
    # BirkebeinerProvider(),
]

for provider in PROVIDERS:
    events = provider.discover_events()

    for event in events:
        if already_scraped(provider.name, event):
            continue

        run_crawler(provider, event)  # subprocess isolation stays

        if has_valid_data(provider.name, event):
            update_index(provider.name, event)
```

### Layer 4: Data Structure

Extend the directory layout to include the provider dimension:

```
data/
├── vasaloppet/
│   ├── index.json          # {year: {event_id: event_name}}
│   └── events/
│       ├── 2024/
│       │   ├── VL_xxx.json
│       │   └── TV_xxx.json
│       └── 2025/
│           └── ...
├── birkebeiner/            # Future provider
│   ├── index.json
│   └── events/
│       └── ...
└── providers.json          # Top-level registry: [{name, label, description}]
```

A new top-level `providers.json` tells the frontend which providers exist:

```json
[
  {"name": "vasaloppet", "label": "Vasaloppet", "description": "Winter and Summer Week events"}
]
```

### Layer 5: Frontend Updates

The frontend gains a provider selector at the top of the hierarchy:

```
Provider → Year → Event → Filters → Visualizations
```

The data loading changes minimally:

```python
API_ROOT = "https://freol35241.github.io/spurta/data/"

def load_providers():
    return requests.get(API_ROOT + "providers.json").json()

def load_index(provider_name):
    return requests.get(f"{API_ROOT}{provider_name}/index.json").json()

def load_event_data(provider_name, year, event_id):
    url = f"{API_ROOT}{provider_name}/events/{year}/{event_id}.json"
    # ... same processing as today
```

### Migration Path

1. **Phase 1 — Restructure data directory**: Move `data/events/` → `data/vasaloppet/events/` and `data/index.json` → `data/vasaloppet/index.json`. Add `data/providers.json`. Update the deploy workflow.
2. **Phase 2 — Introduce provider abstraction in scraper**: Create the `BaseProvider` interface and `VasaloppetProvider`. Refactor `run_scraper.py`. The spider stays the same.
3. **Phase 3 — Update the frontend**: Add provider selector, update data URLs.
4. **Phase 4 — Add a second provider**: Implement a new provider to validate the abstraction works.

### Why This Avoids the Problems of `generalization-trial-1`

| Problem in trial | How this proposal fixes it |
|---|---|
| Spider has too many responsibilities | Spider stays focused on crawling. Discovery is in the provider. Orchestration stays in `run_scraper.py`. |
| Synchronous blocking in async context | Discovery happens in the orchestrator (outside Twisted), not in the spider. |
| Index management fragmented | Index management stays in the orchestrator, after validation, exactly like today. |
| No actual multi-provider abstraction | `BaseProvider` defines a clear interface for any provider. |
| Data path changes break frontend | Migration is explicit, and the frontend is updated to be provider-aware. |
| Lost incremental scraping safeguards | All existing safeguards (`has_valid_data`, dedup, cleanup) are preserved in the orchestrator. |

---

## Summary

The `generalization-trial-1` branch tried to solve the right problem but went about it by pushing too much responsibility into the spider. The better approach is to keep the spider dumb (crawl + extract), keep the orchestrator smart (discover + manage + validate), and introduce a thin provider interface in between. This gives a clean extension point for new providers without disrupting what already works.
