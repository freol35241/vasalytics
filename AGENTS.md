# AGENTS.md

## Project Overview

SPURTA (Split Performance & Unified Race Tracking Analytics) is a race event analytics platform. It scrapes participant results from race timing providers, stores them as JSON, and serves an interactive frontend for visualizing split times and pacing data.

## Repository Structure

```
spurta/
├── app/                        # Frontend
│   ├── main.py                 # Streamlit app (local dev)
│   └── index.html              # Browser build (stlite, deployed to GitHub Pages)
├── scraper/                    # Data scraping pipeline
│   ├── run_scraper.py          # Orchestrator: discovers events, runs spiders, manages indexes
│   ├── mikatiming_spider.py    # Scrapy spider for Mika Timing-based result sites
│   └── providers/              # Provider abstraction layer
│       ├── base.py             # BaseProvider ABC and EventInfo dataclass
│       ├── vasaloppet.py       # Vasaloppet provider (results.vasaloppet.se)
│       └── goteborgsvarvet.py  # Göteborgsvarvet provider (goteborgsvarvet.r.mikatiming.com)
├── data/                       # Scraped result data (committed to repo)
│   ├── providers.json          # Provider registry for the frontend
│   ├── vasaloppet/
│   │   ├── index.json          # {year: {event_id: event_name}}
│   │   └── events/{year}/{event_id}.json
│   └── goteborgsvarvet/
│       ├── index.json
│       └── events/{year}/{event_id}.json
├── .github/workflows/
│   ├── run_scraper.yml         # Scraper CI (manual trigger, commits new data)
│   └── deploy_to_pages.yml     # Deploys app/ + data/ to GitHub Pages on push to main
├── .devcontainer/              # VS Code dev container (Python 3.12)
├── requirements.txt            # Production deps (scrapy, tqdm, requests)
└── requirements_dev.txt        # Dev deps (adds streamlit, matplotlib, seaborn, numpy, pandas)
```

## Tech Stack

**Scraper:** Python 3.12, Scrapy (web crawling), requests (API calls), tqdm (progress bars)

**Frontend:** Streamlit (Python web framework), matplotlib + seaborn (visualization), pandas + numpy (data processing). Deployed as a browser build via [stlite](https://github.com/whitphx/stlite) on GitHub Pages.

**CI/CD:** GitHub Actions for automated scraping and deployment. Dependabot for dependency updates.

## Architecture

The scraper uses a **provider pattern** with three layers:

1. **Providers** (`scraper/providers/`) implement `BaseProvider` to handle event discovery via provider-specific APIs.
2. **Spiders** (`scraper/mikatiming_spider.py`) handle the actual web crawling. Currently there is one shared spider (`MikaTimingSpider`) used by both providers since they both use the Mika Timing platform.
3. **Orchestrator** (`scraper/run_scraper.py`) ties it together: iterates providers, skips already-scraped events, runs spiders in subprocesses (for Twisted reactor isolation), validates output, and updates index files.

The frontend loads `providers.json` to discover available providers, then fetches index and event data via HTTP from the GitHub Pages deployment.

**Important:** `app/index.html` contains an inline copy of `main.py` embedded in JavaScript for the stlite browser build. When modifying the frontend, both files must be kept in sync.

## Development Setup

Clone the repo and use the provided dev container, or set up manually with Python 3.12:

```bash
pip install -r requirements_dev.txt
```

Run the scraper locally:

```bash
cd scraper
python3 run_scraper.py
```

Run the Streamlit app in debug mode:

```bash
streamlit run app/main.py
```

## Adding a New Provider

To add support for a new race result data source:

### 1. Create the provider module

Add a new file under `scraper/providers/`, e.g. `scraper/providers/my_race.py`:

```python
import requests
from providers.base import BaseProvider, EventInfo

class MyRaceProvider(BaseProvider):

    @property
    def name(self) -> str:
        return "my_race"  # Lowercase, filesystem-safe, used in data paths

    @property
    def label(self) -> str:
        return "My Race"  # Human-readable name shown in the frontend

    def discover_events(self) -> list[EventInfo]:
        # Call the provider's API to discover available years and events.
        # Return a list of EventInfo objects.
        events = []
        for year in self._get_years():
            for event_id, event_name in self._get_events(year).items():
                events.append(EventInfo(
                    provider=self.name,
                    year=year,
                    event_id=event_id,
                    event_name=event_name,
                ))
        return events

    def create_spider_cls(self) -> type:
        # Return MikaTimingSpider if the site uses Mika Timing,
        # otherwise create and return a new spider class.
        return MyRaceSpider

    def spider_kwargs(self, event: EventInfo) -> dict:
        # Return kwargs passed to the spider constructor.
        return {"event_id": event.event_id, "base_url": "https://..."}
```

### 2. Create a spider (if needed)

If the new provider uses Mika Timing, reuse `MikaTimingSpider` (see `vasaloppet.py` and `goteborgsvarvet.py` for examples).

Otherwise, create a new Scrapy spider under `scraper/`. The spider must yield dicts with this shape:

```python
{
    "bib_number": "123",
    "age_class": "H21",       # or None
    "start_group": "Elite",   # or None
    "splits": {
        "Split Name": {
            "time": 3661,     # Total seconds from start
            "pace": 4.5,      # Minutes per km as float
        },
        # ... more splits
        "Finish": {
            "time": 14400,
            "pace": 5.0,
        },
    },
}
```

The last split should be named `"Finish"` since the frontend uses this key for the finish time distribution plot.

### 3. Register the provider

Add the provider to the `PROVIDERS` list in `scraper/run_scraper.py`:

```python
from providers.my_race import MyRaceProvider

PROVIDERS = [
    VasaloppetProvider(),
    GoteborgsvarvetProvider(),
    MyRaceProvider(),
]
```

### 4. Run and verify

```bash
cd scraper
python3 run_scraper.py
```

This will discover events, scrape new ones, write data files under `data/my_race/`, and update `data/providers.json`. The frontend will automatically pick up the new provider.

## Data Format

Each event JSON file (`data/{provider}/events/{year}/{event_id}.json`) is an array of participant objects. Each participant has `bib_number`, `age_class`, `start_group`, and `splits` (a dict mapping split names to `{time, pace}` objects).

The `index.json` per provider maps years to event IDs and names: `{"2024": {"EVENT_ID": "Event Name"}}`.

The top-level `providers.json` is an array of `{"name": "...", "label": "..."}` objects, auto-generated by the scraper.
