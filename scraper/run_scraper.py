import json
import requests
import multiprocessing
from pathlib import Path

from tqdm import tqdm
from scrapy.crawler import CrawlerProcess

from vasa_spider import Vasaloppet

DATA_ROOT = Path(__file__).parent.parent / "data"
DATA_ROOT.mkdir(parents=True, exist_ok=True)

INDEX_FILE = DATA_ROOT / "index.json"


def run_crawlers():

    process = CrawlerProcess(
        {
            "ROBOTSTXT_OBEY": False,
            "LOG_LEVEL": "INFO",
            "ITEM_PIPELINES": {
                "item_exporter.ExportItemsPerEvent": 100,
            },
        }
    )

    process.crawl(Vasaloppet)
    process.start()


if __name__ == "__main__":
    run_crawlers()
