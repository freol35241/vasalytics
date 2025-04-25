from pathlib import Path
from itemadapter import ItemAdapter
from scrapy.exporters import JsonItemExporter


FIELDS_TO_EXPORT = [
    "bib_number",
    "age_class",
    "start_group",
    "splits",
]


class ExportItemsPerEvent:
    """Distribute items across multiple JSON files according to
    - which main event they belong to
    - which year
    - the event id"""

    def open_spider(self, spider):
        self._exporters = {}

    def close_spider(self, spider):
        for exporter, output_file in self._exporters.values():
            exporter.finish_exporting()
            output_file.close()

    def _exporter_for_item(self, item):
        adapter = ItemAdapter(item)
        identifier = adapter["identifier"]

        if identifier not in self._exporters:
            path = (
                Path(__file__).parent.parent
                / "data"
                / Path("/".join(identifier) + ".json")
            )
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch()
            output_file = path.open(mode="wb")
            exporter = JsonItemExporter(output_file, fields_to_export=FIELDS_TO_EXPORT, indent=4)
            exporter.start_exporting()
            self._exporters[identifier] = (exporter, output_file)

        return self._exporters[identifier][0]

    def process_item(self, item, spider):
        exporter = self._exporter_for_item(item)
        exporter.export_item(item)
        return item
