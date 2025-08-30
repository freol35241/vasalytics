export class FilterPanel {
  constructor(container, onFilterChange) {
    this.container = container;
    this.onFilterChange = onFilterChange;
    this.eventData = null;
    this.filters = {
      gender: 'All',
      bibNumber: ''
    };
  }

  init(eventData) {
    this.eventData = eventData;
    this.render();
  }

  render() {
    if (!this.eventData) {
      this.container.innerHTML = `
        <p class="text-muted">Select an event to see filtering options</p>
      `;
      return;
    }

    // Check what gender options are available
    const hasGenderMale = this.eventData.participants.some(p => 
      p.age_class?.startsWith('H')
    );
    const hasGenderFemale = this.eventData.participants.some(p => 
      p.age_class?.startsWith('D')
    );

    const genderOptions = ['All'];
    if (hasGenderMale && hasGenderFemale) {
      genderOptions.push('H', 'D');
    }

    this.container.innerHTML = `
      <div class="form-group">
        <label for="gender-filter">Filter by Gender</label>
        <select id="gender-filter">
          ${genderOptions.map(option => {
            const label = option === 'All' ? 'All' : 
                         option === 'H' ? 'Men (H)' : 'Women (D)';
            return `<option value="${option}" ${option === this.filters.gender ? 'selected' : ''}>${label}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="bib-input">Bib Number (Optional)</label>
        <input 
          type="text" 
          id="bib-input" 
          placeholder="Enter bib number..." 
          value="${this.filters.bibNumber}"
        />
      </div>
    `;

    this.setupEventListeners();
  }

  setupEventListeners() {
    const genderFilter = this.container.querySelector('#gender-filter');
    const bibInput = this.container.querySelector('#bib-input');

    genderFilter?.addEventListener('change', (e) => {
      this.filters.gender = e.target.value;
      this.onFilterChange(this.filters);
    });

    bibInput?.addEventListener('input', (e) => {
      this.filters.bibNumber = e.target.value.trim();
      this.onFilterChange(this.filters);
    });
  }

  reset() {
    this.filters = {
      gender: 'All',
      bibNumber: ''
    };
    this.eventData = null;
    this.container.innerHTML = `
      <p class="text-muted">Select an event to see filtering options</p>
    `;
  }
}