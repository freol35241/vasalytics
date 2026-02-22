import json
import requests
import multiprocessing
from pathlib import Path

from tqdm import tqdm
from scrapy.crawler import CrawlerProcess

from vasa_spider import VasalyticsSpider

DATA_ROOT = Path(__file__).parent.parent / "data"

EVENT_DATA_ROOT = DATA_ROOT / "events"
EVENT_DATA_ROOT.mkdir(parents=True, exist_ok=True)

INDEX_FILE = DATA_ROOT / "index.json"


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


def get_years():
    response = requests.get(
        "https://results.vasaloppet.se/index.php?content=ajax2&func=getSearchFields&options"
    )
    response.raise_for_status()
    return [
        str(item["v"][0])
        for item in response.json()["branches"]["lists"]["fields"]["event_main_group"][
            "data"
        ]
        if isinstance(item["v"][0], int)
    ]


def get_events(year: int):
    response = requests.get(
        f"https://results.vasaloppet.se/2025/index.php?content=ajax2&func=getSearchFields&options%5Bb%5D%5Blists%5D%5Bevent_main_group%5D={year}"
    )
    response.raise_for_status()
    all_events = {
        item["v"][0]: item["v"][1]
        for item in response.json()["branches"]["lists"]["fields"]["event"]["data"]
    }

    # Deduplicate: the API may return multiple event IDs with the same name
    # (e.g. cross-season events). Keep only the first occurrence per name.
    seen_names = set()
    events = {}
    for event_id, event_name in all_events.items():
        if event_name not in seen_names:
            seen_names.add(event_name)
            events[event_id] = event_name
    return events


def run_crawler(year, event_id):

    feed_output_uri = f"file://{EVENT_DATA_ROOT / f"{year}" / f"{event_id}.json"}"

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

    process.crawl(VasalyticsSpider, event_id)
    process.start()


if __name__ == "__main__":

    # Get all the years for which there is and event that we can scrape
    years = get_years()

    for year in years:

        events = get_events(year)

        print(f"Fetching data for alla events during {year}")

        for event_id, event_name in tqdm(events.items()):

            if INDEX_FILE.exists():
                with INDEX_FILE.open(encoding="utf-8") as source:
                    index = json.load(source)
            else:
                index = {}

            # Check if we need to scrape this event
            # Skip if event is in index AND file exists with valid data
            event_file = EVENT_DATA_ROOT / year / f"{event_id}.json"
            skip_event = (
                index.get(year, {}).get(event_id) and  # Event is in index
                has_valid_data(event_file)             # File has actual data
            )
            
            if not skip_event:

                # Start scraping (run this in a separate Process to avoid problems with the twisted reactor not being restartable)
                p = multiprocessing.Process(target=run_crawler, args=(year, event_id))
                p.start()
                p.join()

                # Check if the scraped file contains valid data
                event_file = EVENT_DATA_ROOT / year / f"{event_id}.json"
                if has_valid_data(event_file):
                    # Update index only if we got valid data
                    (index.setdefault(year, {}))[event_id] = event_name
                    
                    # And persist to disc
                    with INDEX_FILE.open("w", encoding="utf-8") as target:
                        json.dump(
                            index, target, indent=4, sort_keys=True, ensure_ascii=False
                        )
                else:
                    # Remove empty file if it was created
                    if event_file.exists():
                        event_file.unlink()
                        print(f"Removed empty file for {year}/{event_id}")
                    # Don't add to index since no valid data was found
