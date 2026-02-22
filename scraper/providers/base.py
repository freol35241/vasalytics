from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class EventInfo:
    """Represents a single scrapable event from a provider."""

    provider: str
    year: str
    event_id: str
    event_name: str


class BaseProvider(ABC):
    """Interface that every data event provider must implement.

    The `name` property must be unique and filesystem-safe (lowercase, no spaces).
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique provider identifier used in file paths."""
        ...

    @property
    @abstractmethod
    def label(self) -> str:
        """Human-readable display name for the frontend."""
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
