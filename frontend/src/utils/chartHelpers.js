// Utility functions for chart formatting
export function formatTimeHHMM(seconds) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes - (hours * 60);
  return `${hours.toString().padStart(2, '0')}:${remainingMinutes.toString().padStart(2, '0')}`;
}

export function formatTimeDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Gaussian kernel for KDE
function gaussianKernel(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Calculate optimal bandwidth using Scott's rule
function calculateBandwidth(data) {
  const n = data.length;
  const std = Math.sqrt(data.reduce((sum, x, i, arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return sum + Math.pow(x - mean, 2);
  }, 0) / (n - 1));
  
  return 1.06 * std * Math.pow(n, -0.2);
}

// Kernel Density Estimation (KDE) - mimics seaborn's kdeplot
export function calculateKDE(data, numPoints = 200) {
  if (!data || data.length === 0) return { x: [], y: [] };
  
  const validData = data.filter(d => d && d > 0).sort((a, b) => a - b);
  if (validData.length === 0) return { x: [], y: [] };
  
  const min = validData[0];
  const max = validData[validData.length - 1];
  const bandwidth = calculateBandwidth(validData);
  
  // Create evaluation points
  const x = [];
  const y = [];
  const step = (max - min) / (numPoints - 1);
  
  for (let i = 0; i < numPoints; i++) {
    const xi = min + i * step;
    x.push(xi);
    
    // Calculate density at xi
    let density = 0;
    for (const dataPoint of validData) {
      density += gaussianKernel((xi - dataPoint) / bandwidth);
    }
    density = density / (validData.length * bandwidth);
    y.push(density);
  }
  
  return { x, y };
}

// Generate histogram bins (fallback for comparison)
export function createHistogramBins(data, numBins = 50) {
  if (!data || data.length === 0) return { bins: [], counts: [] };
  
  const validData = data.filter(d => d && d > 0);
  if (validData.length === 0) return { bins: [], counts: [] };
  
  const min = Math.min(...validData);
  const max = Math.max(...validData);
  const binWidth = (max - min) / numBins;
  
  const bins = [];
  const counts = [];
  
  for (let i = 0; i <= numBins; i++) {
    bins.push(min + i * binWidth);
  }
  
  // Count data points in each bin
  for (let i = 0; i < numBins; i++) {
    const binStart = bins[i];
    const binEnd = bins[i + 1];
    const count = validData.filter(d => d >= binStart && d < binEnd).length;
    counts.push(count);
  }
  
  return { bins: bins.slice(0, -1), counts }; // Remove last bin edge
}

// Calculate basic statistics
export function calculateStats(data) {
  if (!data || data.length === 0) return { mean: 0, median: 0, min: 0, max: 0 };
  
  const validData = data.filter(d => d && d > 0).sort((a, b) => a - b);
  if (validData.length === 0) return { mean: 0, median: 0, min: 0, max: 0 };
  
  const sum = validData.reduce((acc, val) => acc + val, 0);
  const mean = sum / validData.length;
  
  const median = validData.length % 2 === 0 
    ? (validData[validData.length / 2 - 1] + validData[validData.length / 2]) / 2
    : validData[Math.floor(validData.length / 2)];
    
  return {
    mean,
    median,
    min: validData[0],
    max: validData[validData.length - 1]
  };
}

// Generate chart colors
export const CHART_COLORS = {
  primary: '#3b82f6',
  mean: '#10b981',
  median: '#6366f1',
  highlight: '#ef4444',
  grid: '#e5e7eb',
  text: '#374151'
};