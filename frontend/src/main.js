import { EventSelector } from './components/EventSelector.js';
import { FilterPanel } from './components/FilterPanel.js';
import { FinishTimeChart } from './components/FinishTimeChart.js';
import dataService from './services/dataService.js';

class VasalyticsApp {
  constructor() {
    this.currentEventData = null;
    this.currentFilters = { gender: 'All', bibNumber: '' };
    
    // Initialize components
    this.eventSelector = new EventSelector(
      document.getElementById('event-selector'),
      this.onEventChange.bind(this)
    );
    
    this.filterPanel = new FilterPanel(
      document.getElementById('filter-panel'),
      this.onFilterChange.bind(this)
    );
    
    this.chart = new FinishTimeChart(
      document.getElementById('chart-container')
    );

    // UI elements
    this.loadingEl = document.getElementById('loading');
    this.errorEl = document.getElementById('error');
  }

  async init() {
    try {
      await this.eventSelector.init();
    } catch (error) {
      this.showError(`Failed to initialize application: ${error.message}`);
    }
  }

  async onEventChange(year, eventId, eventName) {
    if (!year || !eventId) {
      this.currentEventData = null;
      this.filterPanel.reset();
      this.chart.destroy();
      return;
    }

    this.showLoading(`Loading data for ${eventName} (${year})...`);

    try {
      this.currentEventData = await dataService.loadEventData(year, eventId);
      this.filterPanel.init(this.currentEventData);
      this.updateVisualization();
      this.hideLoading();
    } catch (error) {
      this.showError(`Failed to load event data: ${error.message}`);
    }
  }

  onFilterChange(filters) {
    this.currentFilters = filters;
    this.updateVisualization();
  }

  updateVisualization() {
    if (!this.currentEventData) {
      this.chart.destroy();
      return;
    }

    try {
      const filteredData = dataService.filterData(this.currentEventData, this.currentFilters);
      this.chart.render(filteredData);
    } catch (error) {
      this.showError(`Failed to update visualization: ${error.message}`);
    }
  }

  showLoading(message = 'Loading...') {
    this.hideError();
    this.loadingEl.textContent = message;
    this.loadingEl.classList.remove('hidden');
  }

  hideLoading() {
    this.loadingEl.classList.add('hidden');
  }

  showError(message) {
    this.hideLoading();
    this.errorEl.textContent = message;
    this.errorEl.classList.remove('hidden');
  }

  hideError() {
    this.errorEl.classList.add('hidden');
  }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const app = new VasalyticsApp();
  app.init();
});