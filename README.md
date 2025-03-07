# Vasalytics

> "The missing analytics tool for all race events part of Vasaloppet`s Winter and Summer Week."

-----> [Vasalytics](https://freol35241.github.io/vasalytics) <-----

This repository contains four (4) distinct parts:
* Code for scraping event results from [results.vasaloppet.se](results.vasaloppet.se). See [scraper](./scraper/).
* A data repository for all historic results already scraped. See [data](./data/).
* The vasalytics frontend (powered by streamlit). See [app](./app/).
* Github Actions workflows for automatic scraping of new race events and continuous deployments of updated versions of the frontend. See [workflows](./.github/workflows/).

To get started developing, clone the repository and use the provided devcontainer setup.