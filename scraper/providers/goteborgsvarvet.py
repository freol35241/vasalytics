import requests

from providers.base import BaseProvider, EventInfo
from mikatiming_spider import MikaTimingSpider


class GoteborgsvarvetProvider(BaseProvider):

    BASE_URL = "https://goteborgsvarvet.r.mikatiming.com"

    @property
    def name(self) -> str:
        return "goteborgsvarvet"

    @property
    def label(self) -> str:
        return "Göteborgsvarvet"

    def discover_events(self) -> list[EventInfo]:
        events = []
        for year in self._get_years():
            for event_id, event_name in self._get_events(year).items():
                events.append(
                    EventInfo(
                        provider=self.name,
                        year=year,
                        event_id=event_id,
                        event_name=event_name,
                    )
                )
        return events

    def create_spider_cls(self) -> type:
        return MikaTimingSpider

    def spider_kwargs(self, event: EventInfo) -> dict:
        return {
            "event_id": event.event_id,
            "base_url": f"{self.BASE_URL}/{event.year}",
        }

    # --- Private helpers ---

    def _get_years(self):
        response = requests.get(
            f"{self.BASE_URL}/index.php"
            "?content=ajax2&func=getSearchFields&options",
            timeout=30,
        )
        response.raise_for_status()
        return [
            str(item["v"][0])
            for item in response.json()["branches"]["lists"]["fields"][
                "event_main_group"
            ]["data"]
            if isinstance(item["v"][0], int)
        ]

    def _get_events(self, year: str):
        response = requests.get(
            f"{self.BASE_URL}/{year}/index.php"
            f"?content=ajax2&func=getSearchFields"
            f"&options%5Bb%5D%5Blists%5D%5Bevent_main_group%5D={year}",
            timeout=30,
        )
        response.raise_for_status()
        all_events = {
            item["v"][0]: item["v"][1]
            for item in response.json()["branches"]["lists"]["fields"]["event"][
                "data"
            ]
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
