# Vasalytics

> "The missing analytics tool for all race events part of Vasaloppet`s Winter and Summer Week."

-----> [Vasalytics](https://freol35241.github.io/vasalytics) <-----

This repository contains distinct parts:
* Code for scraping event results from [results.vasaloppet.se](results.vasaloppet.se). See [scraper](./scraper/).
* A data repository for all historic results already scraped. See [data](./data/).
* The original vasalytics frontend (powered by streamlit). See [app](./app/).
* **NEW**: JavaScript POC frontend for improved performance. See [frontend](./frontend/).
* Github Actions workflows for automatic scraping and deployments. See [workflows](./.github/workflows/).

## Frontends

### Current: Streamlit (Python in Browser)
- **Location**: [/streamlit.html](https://freol35241.github.io/vasalytics/streamlit.html)
- **Technology**: Streamlit + stlite + Pyodide (WebAssembly)
- **Load time**: ~10+ seconds, ~10MB+ download
- **Features**: Complete analytics suite

### NEW: JavaScript POC 
- **Location**: [/](https://freol35241.github.io/vasalytics) (main site)
- **Technology**: Vanilla JS + Chart.js
- **Load time**: ~2 seconds, ~220KB bundle  
- **Features**: Core analytics (PDF chart, filtering, bib highlighting)

## Development setup

### JavaScript Frontend
```bash
cd frontend
npm install
npm run dev      # Development server  
npm run build    # Production build
```

### Python Frontend
```bash
streamlit run app/main.py
```

### Scraper
```bash
cd scraper
python3 run_scraper.py
```

## Performance Comparison (POC Results)

| Metric | Python (Current) | JavaScript (POC) |
|--------|------------------|------------------|
| Initial Load | ~10+ seconds | ~2 seconds |
| Bundle Size | ~10MB+ | ~220KB |
| Chart Render | ~500ms | ~200ms |
