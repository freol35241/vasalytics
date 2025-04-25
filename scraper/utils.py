import re

from scrapy.http import Request, Response

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


def forward_metadata(request: Request, response: Response):
    meta = dict(**request.meta, identifier=response.meta["identifier"])
    return request.replace(meta=meta)
