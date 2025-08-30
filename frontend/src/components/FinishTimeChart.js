import { Chart, registerables } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { calculateKDE, calculateStats, formatTimeDuration, formatTimeHHMM, CHART_COLORS } from '../utils/chartHelpers.js';

// Register Chart.js components
Chart.register(...registerables, annotationPlugin);

export class FinishTimeChart {
  constructor(container) {
    this.container = container;
    this.chart = null;
    this.canvas = null;
  }

  render(filteredData) {
    // Clear previous chart
    this.destroy();

    if (!filteredData || !filteredData.times || filteredData.times.length === 0) {
      this.renderEmpty();
      return;
    }

    // Extract finish times
    const finishTimes = filteredData.times
      .map(timeData => timeData.Finish)
      .filter(time => time && time > 0);

    if (finishTimes.length === 0) {
      this.renderEmpty();
      return;
    }

    // Calculate KDE (kernel density estimation)
    const { x: kdeX, y: kdeY } = calculateKDE(finishTimes, 200);
    const stats = calculateStats(finishTimes);

    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.width = 800;
    this.canvas.height = 400;
    this.container.appendChild(this.canvas);

    // Generate tick marks (every 15 minutes)
    const tickInterval = 15 * 60; // 15 minutes in seconds
    const minTick = Math.floor(stats.min / tickInterval) * tickInterval;
    const maxTick = Math.ceil(stats.max / tickInterval) * tickInterval;
    const ticks = [];
    for (let t = minTick; t <= maxTick; t += tickInterval) {
      ticks.push(t);
    }

    // Prepare KDE data for line chart with fill
    const kdeData = kdeX.map((x, i) => ({ x, y: kdeY[i] }));
    
    const chartData = {
      datasets: [{
        label: 'All Participants',
        data: kdeData,
        backgroundColor: CHART_COLORS.primary + '80',
        borderColor: CHART_COLORS.primary,
        borderWidth: 2,
        fill: true,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 0
      }]
    };

    // Prepare annotations for vertical lines
    const annotations = {
      meanLine: {
        type: 'line',
        xMin: stats.mean,
        xMax: stats.mean,
        borderColor: CHART_COLORS.mean,
        borderWidth: 2,
        borderDash: [5, 5],
        label: {
          display: true,
          content: `Mean (${formatTimeDuration(stats.mean)})`,
          position: 'start',
          backgroundColor: CHART_COLORS.mean + '20',
          color: CHART_COLORS.mean,
          font: { size: 12 },
          padding: 4
        }
      },
      medianLine: {
        type: 'line',
        xMin: stats.median,
        xMax: stats.median,
        borderColor: CHART_COLORS.median,
        borderWidth: 2,
        borderDash: [5, 5],
        label: {
          display: true,
          content: `Median (${formatTimeDuration(stats.median)})`,
          position: 'end',
          backgroundColor: CHART_COLORS.median + '20',
          color: CHART_COLORS.median,
          font: { size: 12 },
          padding: 4
        }
      }
    };

    // Add bib highlight if available
    if (filteredData.bibData && filteredData.bibData.times.Finish) {
      const bibTime = filteredData.bibData.times.Finish;
      annotations.bibLine = {
        type: 'line',
        xMin: bibTime,
        xMax: bibTime,
        borderColor: CHART_COLORS.highlight,
        borderWidth: 3,
        borderDash: [5, 5],
        label: {
          display: true,
          content: `Bib ${filteredData.bibData.participant.bib_number} (${formatTimeDuration(bibTime)})`,
          position: 'center',
          backgroundColor: CHART_COLORS.highlight + '20',
          color: CHART_COLORS.highlight,
          font: { size: 12 },
          padding: 4
        }
      };
    }

    const config = {
      type: 'line',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Probability Density Function of Finish Times',
            font: { size: 16, weight: 'normal' },
            color: CHART_COLORS.text
          },
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              font: { size: 12 }
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              title: function(context) {
                return `Time: ${formatTimeDuration(context[0].parsed.x)}`;
              },
              label: function(context) {
                return `Density: ${context.parsed.y.toFixed(6)}`;
              }
            }
          },
          annotation: {
            annotations: annotations
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        },
        scales: {
          x: {
            type: 'linear',
            display: true,
            title: {
              display: true,
              text: 'Finish Time (HH:MM)',
              font: { size: 14 },
              color: CHART_COLORS.text
            },
            ticks: {
              stepSize: tickInterval,
              maxRotation: 45,
              callback: function(value) {
                return formatTimeHHMM(value);
              },
              font: { size: 11 },
              color: CHART_COLORS.text
            },
            grid: {
              color: CHART_COLORS.grid,
              lineWidth: 1
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Density',
              font: { size: 14 },
              color: CHART_COLORS.text
            },
            beginAtZero: true,
            ticks: {
              font: { size: 11 },
              color: CHART_COLORS.text
            },
            grid: {
              color: CHART_COLORS.grid,
              lineWidth: 1
            }
          }
        }
      }
    };

    this.chart = new Chart(this.canvas, config);
  }

  renderEmpty() {
    this.container.innerHTML = `
      <div class="empty-chart">
        <p>No data available for the selected filters.</p>
        <p>Try selecting a different year/event or adjusting your filters.</p>
      </div>
    `;
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
    this.container.innerHTML = '';
  }
}