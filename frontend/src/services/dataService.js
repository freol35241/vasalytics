const API_ROOT = 'https://freol35241.github.io/vasalytics/data/';

class DataService {
  constructor() {
    this.cache = new Map();
  }

  async loadIndex() {
    const cacheKey = 'index';
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch(`${API_ROOT}index.json`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      throw new Error(`Failed to load index: ${error.message}`);
    }
  }

  async loadEventData(year, eventId) {
    const cacheKey = `${year}_${eventId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const url = `${API_ROOT}events/${year}/${eventId}.json`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const rawData = await response.json();
      
      // Process the data similar to the Python version
      const processedData = this.processEventData(rawData);
      this.cache.set(cacheKey, processedData);
      return processedData;
    } catch (error) {
      throw new Error(`Failed to load event data: ${error.message}`);
    }
  }

  processEventData(rawData) {
    if (!rawData || rawData.length === 0) {
      throw new Error('No data available for this event');
    }

    const participants = [];
    const times = [];
    const paces = [];

    rawData.forEach(participant => {
      const { splits, ...participantData } = participant;
      
      // Fill missing values
      participantData.age_class = participantData.age_class || '';
      participantData.start_group = participantData.start_group || '';
      
      participants.push(participantData);

      // Extract times and paces from splits
      const timeData = {};
      const paceData = {};
      
      if (splits && typeof splits === 'object') {
        Object.entries(splits).forEach(([location, data]) => {
          if (data && typeof data === 'object') {
            timeData[location.trim()] = data.time || 0;
            paceData[location.trim()] = data.pace || 0;
          }
        });
      }
      
      times.push(timeData);
      paces.push(paceData);
    });

    return {
      participants,
      times,
      paces
    };
  }

  // Helper method to filter data
  filterData(data, filters) {
    const { gender, startGroup, bibNumber } = filters;
    let filteredIndices = data.participants.map((_, index) => index);

    if (gender && gender !== 'All') {
      filteredIndices = filteredIndices.filter(i => 
        data.participants[i].age_class?.startsWith(gender)
      );
    }

    if (startGroup && startGroup !== 'All') {
      filteredIndices = filteredIndices.filter(i => 
        data.participants[i].start_group === startGroup
      );
    }

    return {
      participants: filteredIndices.map(i => data.participants[i]),
      times: filteredIndices.map(i => data.times[i]),
      paces: filteredIndices.map(i => data.paces[i]),
      bibData: bibNumber ? this.getBibData(data, bibNumber) : null
    };
  }

  getBibData(data, bibNumber) {
    const index = data.participants.findIndex(p => p.bib_number === bibNumber);
    if (index === -1) return null;
    
    return {
      participant: data.participants[index],
      times: data.times[index],
      paces: data.paces[index]
    };
  }
}

export default new DataService();