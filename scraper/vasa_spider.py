import json
from pathlib import Path

import requests
from tqdm import tqdm
from scrapy import Request
from scrapy.spiders import CrawlSpider, Rule
from scrapy.linkextractors import LinkExtractor

from utils import convert_pace_to_float, convert_time_to_seconds, forward_metadata

MAIN_EVENT = "Vasaloppet"

DATA_ROOT = Path(__file__).parent.parent / "data"

MAIN_EVENT_ROOT = DATA_ROOT / MAIN_EVENT
MAIN_EVENT_ROOT.mkdir(parents=True, exist_ok=True)

INDEX_FILE = MAIN_EVENT_ROOT / "index.json"


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
    return {
        item["v"][0]: item["v"][1]
        for item in response.json()["branches"]["lists"]["fields"]["event"]["data"]
    }


class Vasaloppet(CrawlSpider):
    name = "vasalytics"
    rules = (
        Rule(
            LinkExtractor(restrict_css="ul.pagination > li.pages-nav-button"),
            follow=True,
            process_request=forward_metadata,
        ),
        Rule(LinkExtractor(allow=r"\?content=detail"), callback="parse_details", process_request=forward_metadata),
    )

    def start_requests(self):

        # Get all the years for which there is an event that we can scrape
        for year in get_years():

            # Fetch all events for this year
            events = get_events(year)

            for event_id, event_name in tqdm(events.items()):

                if INDEX_FILE.exists():
                    with INDEX_FILE.open(encoding="utf-8") as source:
                        index = json.load(source)
                else:
                    index = {}

                # If event_id is not already in the index file, lets scrape this event
                if not index.get(year, {}).get(event_id):

                    identifier = (MAIN_EVENT, year, event_id)

                    yield Request(
                        f"https://results.vasaloppet.se/?event={event_id}&pid=list",
                        dont_filter=True,
                        meta={"identifier": identifier},
                    )

                    # Update index
                    (index.setdefault(year, {}))[event_id] = event_name

                    # And persist to disc
                    with INDEX_FILE.open("w", encoding="utf-8") as target:
                        json.dump(
                            index, target, indent=4, sort_keys=True, ensure_ascii=False
                        )

    def parse_details(self, response):
        """Extracts split data for each participant"""
        output = {
            "bib_number": response.css(".f-start_no_text.last::text").get(),
            "age_class": response.css(".f-_type_age_class.last::text").get(),
            "start_group": response.css(".f-start_group.last::text").get(),
        }

        splits = output["splits"] = {}
        for split in response.css("div.box-splits > div > table > tbody > tr"):
            location = split.css(".desc::text").get()
            time = split.css(".time::text").get()
            pace = split.css(".min_km::text").get()

            if location and time and pace:
                # If any of these are None, we skip this split.
                splits[location] = {
                    "time": convert_time_to_seconds(time),
                    "pace": convert_pace_to_float(pace),
                }

        # We want at least one split to push this item down the pipe
        if splits:

            # Make sure we forward the metadata
            output["identifier"] = response.meta["identifier"]
            yield output
