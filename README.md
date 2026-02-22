# SPURTA

> Split Performance & Unified Race Tracking Analytics

-----> [SPURTA](https://freol35241.github.io/spurta) <-----

This repository contains four (4) distinct parts:
* Code for scraping event results from supported race data providers. See [scraper](./scraper/).
* A data repository for all historic results already scraped. See [data](./data/).
* The SPURTA frontend (powered by streamlit). See [app](./app/).
* Github Actions workflows for automatic scraping of new race events and continuous deployments of updated versions of the frontend. See [workflows](./.github/workflows/).

## Development setup

To get started developing, clone the repository and use the provided devcontainer setup.

To run the scraper locally: `cd scraper; python3 run_scraper.py`

To run the streamlit app in debug mode: `streamlit run app/main.py`
