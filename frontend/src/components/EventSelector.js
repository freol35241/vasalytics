import dataService from '../services/dataService.js';

export class EventSelector {
  constructor(container, onEventChange) {
    this.container = container;
    this.onEventChange = onEventChange;
    this.indexData = null;
    this.selectedYear = null;
    this.selectedEventId = null;
  }

  async init() {
    try {
      this.indexData = await dataService.loadIndex();
      this.render();
    } catch (error) {
      this.renderError(error.message);
    }
  }

  render() {
    const years = Object.keys(this.indexData).sort((a, b) => b - a);
    
    this.container.innerHTML = `
      <div class="form-group">
        <label for="year-select">Select Year</label>
        <select id="year-select">
          <option value="">Choose a year...</option>
          ${years.map(year => 
            `<option value="${year}">${year}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="event-select">Select Event</label>
        <select id="event-select" disabled>
          <option value="">Choose an event...</option>
        </select>
      </div>
    `;

    this.setupEventListeners();
  }

  setupEventListeners() {
    const yearSelect = this.container.querySelector('#year-select');
    const eventSelect = this.container.querySelector('#event-select');

    yearSelect.addEventListener('change', (e) => {
      const year = e.target.value;
      this.selectedYear = year;
      this.updateEventOptions(year);
    });

    eventSelect.addEventListener('change', (e) => {
      const eventId = e.target.value;
      this.selectedEventId = eventId;
      
      if (this.selectedYear && eventId) {
        const eventName = this.indexData[this.selectedYear][eventId];
        this.onEventChange(this.selectedYear, eventId, eventName);
      } else {
        this.onEventChange(null, null, null);
      }
    });
  }

  updateEventOptions(year) {
    const eventSelect = this.container.querySelector('#event-select');
    
    if (!year) {
      eventSelect.disabled = true;
      eventSelect.innerHTML = '<option value="">Choose an event...</option>';
      return;
    }

    const events = this.indexData[year];
    eventSelect.disabled = false;
    eventSelect.innerHTML = `
      <option value="">Choose an event...</option>
      ${Object.entries(events).map(([id, name]) => 
        `<option value="${id}">${name}</option>`
      ).join('')}
    `;
  }

  renderError(message) {
    this.container.innerHTML = `
      <div class="error">
        <p>Failed to load event data: ${message}</p>
      </div>
    `;
  }
}