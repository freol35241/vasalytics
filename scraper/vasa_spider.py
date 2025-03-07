import re

from scrapy.linkextractors import LinkExtractor
from scrapy.spiders import CrawlSpider, Rule

# Precompile regex patterns for efficiency
PACE_PATTERN = re.compile(r"(\d+):(\d+)")
TIME_PATTERN = re.compile(r"(\d+):(\d+):(\d+)")


def convert_pace_to_float(pace_str):
    """Converts 'MM:SS' string to float (fractional minutes)."""
    match = PACE_PATTERN.match(pace_str)
    if match:
        minutes, seconds = map(int, match.groups())
        return minutes + (seconds / 60)


def convert_time_to_seconds(time_str):
    """Converts 'HH:MM:SS' string to integer (total seconds)."""
    match = TIME_PATTERN.match(time_str)
    if match:
        hours, minutes, seconds = map(int, match.groups())
        return (hours * 3600) + (minutes * 60) + seconds


class VasalyticsSpider(CrawlSpider):
    name = "vasalytics"
    rules = (
        Rule(
            LinkExtractor(restrict_css="ul.pagination > li.pages-nav-button"),
            follow=True,
        ),
        Rule(LinkExtractor(allow=r"\?content=detail"), callback="parse_details"),
    )

    def __init__(self, event_id, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.start_urls = [f"https://results.vasaloppet.se/?event={event_id}&pid=list"]

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

        if splits:
            # We want at least one split to push this item down the pipe
            yield output
