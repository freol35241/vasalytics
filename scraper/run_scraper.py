import json
import multiprocessing
from pathlib import Path

from tqdm import tqdm
from scrapy.crawler import CrawlerProcess

from providers.vasaloppet import VasaloppetProvider
from providers.goteborgsvarvet import GoteborgsvarvetProvider

DATA_ROOT = Path(__file__).parent.parent / "data"

# --- Provider registry ---
PROVIDERS = [
    VasaloppetProvider(),
    GoteborgsvarvetProvider(),
]


def has_valid_data(file_path: Path) -> bool:
    """
    Check if a JSON file contains actual data (not empty or just an empty array).

    Args:
        file_path: Path to the JSON file to check

    Returns:
        bool: True if file contains meaningful data, False otherwise
    """
    if not file_path.exists():
        return False

    try:
        with file_path.open(encoding="utf-8") as f:
            data = json.load(f)

        # Check if data is a non-empty list with actual content
        if isinstance(data, list) and len(data) > 0:
            return True

        # File exists but contains empty data
        return False
    except (json.JSONDecodeError, IOError):
        # File is corrupted or unreadable
        return False


def load_index(index_file: Path) -> dict:
    if index_file.exists():
        with index_file.open(encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_index(index_file: Path, index: dict):
    with index_file.open("w", encoding="utf-8") as f:
        json.dump(index, f, indent=4, sort_keys=True, ensure_ascii=False)


def write_providers_json():
    """Write the top-level providers.json from the PROVIDERS registry."""
    providers_file = DATA_ROOT / "providers.json"
    registry = [{"name": p.name, "label": p.label} for p in PROVIDERS]
    with providers_file.open("w", encoding="utf-8") as f:
        json.dump(registry, f, indent=4, ensure_ascii=False)


def run_crawler(spider_cls, spider_kwargs, feed_output_uri):
    """Run a single spider in a subprocess-safe way."""
    process = CrawlerProcess(
        settings={
            "FEEDS": {
                feed_output_uri: {"format": "json", "overwrite": True},
            },
            "FEED_EXPORT_ENCODING": "utf-8",
            "ROBOTSTXT_OBEY": False,
            "LOG_LEVEL": "INFO",
        }
    )
    process.crawl(spider_cls, **spider_kwargs)
    process.start()


if __name__ == "__main__":

    write_providers_json()

    for provider in PROVIDERS:
        events_root = DATA_ROOT / provider.name / "events"
        events_root.mkdir(parents=True, exist_ok=True)
        index_file = DATA_ROOT / provider.name / "index.json"

        print(f"\n=== Provider: {provider.label} ===")
        events = provider.discover_events()

        for event in tqdm(events, desc=provider.label):
            index = load_index(index_file)

            event_file = events_root / event.year / f"{event.event_id}.json"
            skip_event = (
                index.get(event.year, {}).get(event.event_id)
                and has_valid_data(event_file)
            )

            if not skip_event:
                spider_cls = provider.create_spider_cls()
                kwargs = provider.spider_kwargs(event)
                feed_uri = f"file://{events_root / event.year / f'{event.event_id}.json'}"

                # Run in a separate Process to avoid Twisted reactor restart issues
                p = multiprocessing.Process(
                    target=run_crawler,
                    args=(spider_cls, kwargs, feed_uri),
                )
                p.start()
                p.join()

                if has_valid_data(event_file):
                    index.setdefault(event.year, {})[event.event_id] = event.event_name
                    save_index(index_file, index)
                else:
                    if event_file.exists():
                        event_file.unlink()
                        print(f"Removed empty file for {provider.name}/{event.year}/{event.event_id}")
