import CSVParser from '../services/csv-parser.js';
import DataProcessor from '../services/data-processor.js';
import { decodeSharePointPath } from '../utils/helpers.js';

class DataAnalyzerComponent extends HTMLElement {
  constructor() {
    super();
    this.rawData = null;
    this.processor = null;
    this.stats = null;
    this.currentView = 'upload';
    this.currentTab = 'dashboard';
    this.detailBackTab = 'list';
  }

  connectedCallback() {
    this.render();
    this.attachEventListeners();
    
    // Listen for theme changes and re-render charts
    this.themeChangeHandler = () => {
      if (window.APP_DEBUG) {
        console.log('Theme changed event received, currentView:', this.currentView, 'currentTab:', this.currentTab);
      }
      if (this.stats && this.currentView === 'analysis') {
        if (window.APP_DEBUG) {
          console.log('Re-rendering charts...');
        }
        // Small timeout to ensure DOM has updated
        setTimeout(() => this.renderCharts(), 10);
      }
    };
    window.addEventListener('theme-changed', this.themeChangeHandler);
  }

  disconnectedCallback() {
    // Clean up event listener
    if (this.themeChangeHandler) {
      window.removeEventListener('theme-changed', this.themeChangeHandler);
    }
  }

  render() {
    this.innerHTML = `
      <div class="data-analyzer">
        <div id="upload-view" class="analyzer-view">
          ${this.renderUploadView()}
        </div>
        <div id="analysis-view" class="analyzer-view" style="display:none;">
          ${this.renderAnalysisView()}
        </div>
      </div>
    `;
  }

  renderUploadView() {
    return `
      <div class="upload-container">
        <div class="card card--accent-blue">
          <div class="card-body">
            <strong>Tip:</strong> You can scan specific sites via "Include Sites" in Step 1. In analysis you can upload multiple exports one after another.
          </div>
        </div>
        <div class="card upload-card">
          <div class="card-body">
            <div class="upload-zone" id="upload-zone">
              <div class="upload-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
              <h3>Drag your CSV or JSON file here</h3>
              <p>or</p>
              <button class="btn btn-primary" id="select-file-btn"><i class="fa-solid fa-file-import"></i> Select File</button>
              <input type="file" id="file-input" accept=".csv,.json" style="display:none;">
              <p class="upload-hint">Maximum 50MB • CSV or JSON format</p>
            </div>
            <div class="upload-progress" id="upload-progress" style="display:none;">
              <div class="spinner"></div>
              <p><i class="fa-solid fa-arrows-rotate"></i> Processing file...</p>
            </div>
          </div>
        </div>

        <div class="info-cards">
          <div class="card">
            <div class="card-body">
              <h4><i class="fa-solid fa-user-shield"></i> 100% Privacy</h4>
              <p>Your file is processed locally in your browser. No data leaves your computer.</p>
            </div>
          </div>
          <div class="card">
            <div class="card-body">
              <h4><i class="fa-solid fa-bolt"></i> Fast Analysis</h4>
              <p>Native JavaScript processing for optimal performance, even with large files.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderAnalysisView() {
    return `
      <div class="analysis-container">
        <div id="analysis-loading" class="analysis-loading" style="display:none;">
          <div class="spinner"></div>
          <p>Analyzing data...</p>
        </div>
        <div id="analysis-content">
        <div class="analysis-header">
          <button class="btn btn-secondary" id="back-to-upload">
            <i class="fa-solid fa-arrow-left"></i> New File
          </button>
          <div class="export-actions">
            <button class="btn btn-secondary" id="export-csv"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
            <button class="btn btn-secondary" id="export-json"><i class="fa-solid fa-code"></i> Export JSON</button>
          </div>
        </div>

        <div class="overview-cards" id="overview-cards"></div>

        <div class="analysis-tabs">
          <button class="tab-btn active" data-tab="dashboard"><i class="fa-solid fa-chart-pie"></i> Dashboard</button>
          <button class="tab-btn" data-tab="tree"><i class="fa-solid fa-sitemap"></i> Tree View</button>
          <button class="tab-btn" data-tab="list"><i class="fa-solid fa-table"></i> List</button>
          <button class="tab-btn" data-tab="detail" style="display:none;"><i class="fa-solid fa-info-circle"></i> Detail</button>
        </div>

        <div class="tab-content">
          <div id="tab-dashboard" class="tab-pane active">
            <div class="charts-grid" id="charts-grid"></div>
            <div class="top-stats-grid" id="top-stats-grid"></div>
          </div>

          <div id="tab-tree" class="tab-pane" style="display:none;">
            <div class="tree-controls">
              <input type="text" id="tree-search" class="form-control" placeholder="Search in structure...">
              <div class="tree-filters">
                <label class="form-check">
                  <input type="checkbox" id="show-anonymous-only" class="form-check-input">
                  <span class="form-check-label">Only anonymous links</span>
                </label>
                <label class="form-check">
                  <input type="checkbox" id="show-never-expires-only" class="form-check-input">
                  <span class="form-check-label">Only non-expiring links</span>
                </label>
              </div>
            </div>
            <div class="tree-view" id="tree-view"></div>
          </div>

          <div id="tab-list" class="tab-pane" style="display:none;">
            <div class="details-filters">
              <input type="text" id="details-search" class="form-control" placeholder="Search...">
              <select id="filter-link-type" class="form-control">
                <option value="all">All link types</option>
                <option value="Anonymous">Anonymous</option>
                <option value="Organization">Organization</option>
                <option value="Users">Specific users</option>
              </select>
              <select id="filter-status" class="form-control">
                <option value="all">All statuses</option>
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
              </select>
            </div>
            <div class="details-table" id="details-table"></div>
          </div>

          <div id="tab-detail" class="tab-pane" style="display:none;">
            <button class="btn btn-secondary mb-3" id="back-to-list"><i class="fa-solid fa-arrow-left"></i> Back to List</button>
            <div id="detail-view" class="detail-view"></div>
          </div>
        </div>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    const uploadZone = this.querySelector('#upload-zone');
    const fileInput = this.querySelector('#file-input');
    const selectFileBtn = this.querySelector('#select-file-btn');

    if (uploadZone) {
      uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
      });

      uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
      });

      uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) this.handleFile(file);
      });
    }

    if (selectFileBtn && fileInput) {
      selectFileBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleFile(file);
      });
    }
  }

  async handleFile(file) {
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File is too large. Maximum 50MB.');
      return;
    }

    const extension = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'json'].includes(extension)) {
      alert('Only CSV and JSON files are supported.');
      return;
    }

    this.showProgress();

    try {
      // Process file asynchronously to avoid blocking UI
      await this.processFileAsync(file, extension);
      
      if (window.analytics) {
        window.analytics.trackEvent('file_uploaded', { type: extension, size: file.size });
      }
    } catch (error) {
      console.error('File processing error:', error);
      alert(`Error processing file: ${error.message}`);
      this.hideProgress();
    }
  }

  showProgress() {
    const uploadZone = this.querySelector('#upload-zone');
    const progress = this.querySelector('#upload-progress');
    if (uploadZone) uploadZone.style.display = 'none';
    if (progress) progress.style.display = 'block';
  }

  hideProgress() {
    const uploadZone = this.querySelector('#upload-zone');
    const progress = this.querySelector('#upload-progress');
    if (uploadZone) uploadZone.style.display = 'flex';
    if (progress) progress.style.display = 'none';
  }

  async processFileAsync(file, extension) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = e.target.result;
          await new Promise(r => setTimeout(r, 50));
          if (extension === 'json') {
            this.rawData = JSON.parse(text);
          } else {
            const parsed = CSVParser.parse(text);
            CSVParser.validateStructure(parsed.data);
            this.rawData = parsed.data;
          }
          await new Promise(r => setTimeout(r, 50));
          this.processData();
          await new Promise(r => setTimeout(r, 50));
          this.showAnalysisView();
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  processData() {
    this.processor = new DataProcessor(this.rawData);
    this.stats = this.processor.processAll();
    
    // Track analysis completion
    if (window.analytics && this.rawData) {
      window.analytics.trackAnalysisComplete(this.rawData.length);
    }
  }

  loadDemoData(data) {
    this.rawData = data;
    this.processData();
    this.showAnalysisView();
  }

  showAnalysisView() {
    const uploadView = this.querySelector('#upload-view');
    const analysisView = this.querySelector('#analysis-view');
    
    this.currentView = 'analysis';
    
    if (uploadView) uploadView.style.display = 'none';
    if (analysisView) {
      analysisView.style.display = 'block';
      analysisView.innerHTML = this.renderAnalysisView();
      this.setAnalysisLoading(true);

      // Defer heavy render work to allow the loading state to paint
      setTimeout(() => {
        this.attachAnalysisListeners();
        this.renderOverviewCards();
        this.renderCharts();
        this.renderTopStats();
        this.renderTreeView();
        this.renderSecurityInsights();
        this.renderDetailsTable();
        this.setAnalysisLoading(false);
      }, 0);
    }
  }

  setAnalysisLoading(show) {
    const loading = this.querySelector('#analysis-loading');
    const content = this.querySelector('#analysis-content');
    if (loading) loading.style.display = show ? 'flex' : 'none';
    if (content) content.style.visibility = show ? 'hidden' : 'visible';
  }

  attachAnalysisListeners() {
    const backBtn = this.querySelector('#back-to-upload');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.rawData = null;
        this.processor = null;
        this.stats = null;
        this.render();
        this.attachEventListeners();
      });
    }

    const tabButtons = this.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    const exportCsvBtn = this.querySelector('#export-csv');
    const exportJsonBtn = this.querySelector('#export-json');
    
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => this.exportData('csv'));
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => this.exportData('json'));
  }

  switchTab(tabName) {
    const buttons = this.querySelectorAll('.tab-btn');
    const panes = this.querySelectorAll('.tab-pane');

    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    panes.forEach(pane => {
      pane.style.display = pane.id === `tab-${tabName}` ? 'block' : 'none';
    });

    // Track current active tab for contextual navigation
    this.currentTab = tabName;
  }

  renderOverviewCards() {
    const container = this.querySelector('#overview-cards');
    if (!container || !this.stats) return;

    const { overview } = this.stats;
    
    container.innerHTML = `
      <div class="stat-card stat-card--total" style="border-left: 4px solid #0078d4;">
        <i class="fa-solid fa-chart-column stat-card-icon" style="color: #0078d4;"></i>
        <div class="stat-label">Total Links</div>
        <div class="stat-value" style="color: #0078d4;">${overview.total}</div>
      </div>
      <div class="stat-card stat-card--active" style="border-left: 4px solid #00b294;">
        <i class="fa-solid fa-circle-check stat-card-icon" style="color: #00b294;"></i>
        <div class="stat-label">Active</div>
        <div class="stat-value" style="color: #00b294;">${overview.active}</div>
      </div>
      <div class="stat-card stat-card--expired" style="border-left: 4px solid #8764b8;">
        <i class="fa-solid fa-circle-xmark stat-card-icon" style="color: #8764b8;"></i>
        <div class="stat-label">Expired</div>
        <div class="stat-value" style="color: #8764b8;">${overview.expired}</div>
      </div>
      <div class="stat-card stat-card--anonymous" style="border-left: 4px solid #ff8c00;">
        <i class="fa-solid fa-globe stat-card-icon" style="color: #ff8c00;"></i>
        <div class="stat-label">Anonymous Links</div>
        <div class="stat-value" style="color: #ff8c00;">${overview.anonymous}</div>
      </div>
      <div class="stat-card stat-card--never" style="border-left: 4px solid #d13438;">
        <i class="fa-solid fa-infinity stat-card-icon" style="color: #d13438;"></i>
        <div class="stat-label">Never Expires</div>
        <div class="stat-value" style="color: #d13438;">${overview.neverExpires}</div>
      </div>
    `;
  }

  renderCharts() {
    const container = this.querySelector('#charts-grid');
    if (!container || !this.stats) return;

    const { charts } = this.stats;

    container.innerHTML = `
      <div class="card chart-card">
        <div class="card-header"><h4>Link Type Distribution</h4></div>
        <div class="card-body">
          <canvas id="chart-link-type"></canvas>
        </div>
      </div>
      <div class="card chart-card">
        <div class="card-header"><h4>Access Rights</h4></div>
        <div class="card-body">
          <canvas id="chart-access-type"></canvas>
        </div>
      </div>
      <div class="card chart-card">
        <div class="card-header"><h4>Expiration Timeline</h4></div>
        <div class="card-body">
          <canvas id="chart-expiry"></canvas>
        </div>
      </div>
    `;

    if (window.APP_DEBUG) {
      console.log('Chart data:', {
        linkTypeDistribution: charts.linkTypeDistribution,
        accessTypeDistribution: charts.accessTypeDistribution,
        expiryTimeline: charts.expiryTimeline,
        linksPerSite: charts.linksPerSite
      });
    }

    this.drawPieChart('chart-link-type', charts.linkTypeDistribution);
    this.drawBarChart('chart-access-type', charts.accessTypeDistribution);
    this.drawBarChart('chart-expiry', charts.expiryTimeline);
  }

  drawPieChart(canvasId, data) {
    const canvas = this.querySelector(`#${canvasId}`);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const total = data.reduce((sum, item) => sum + item.value, 0);
    
    const colors = ['#0078d4', '#00b294', '#8764b8', '#ff8c00', '#d13438', '#00b7c3'];
    
    canvas.width = 300;
    canvas.height = 300;
    
    let currentAngle = -Math.PI / 2;
    
    data.forEach((item, index) => {
      const sliceAngle = (item.value / total) * 2 * Math.PI;
      
      ctx.fillStyle = colors[index % colors.length];
      ctx.beginPath();
      ctx.moveTo(150, 150);
      ctx.arc(150, 150, 120, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();
      
      currentAngle += sliceAngle;
    });

    const legend = data.map((item, index) => {
      const percentage = ((item.value / total) * 100).toFixed(1);
      return `<div class="legend-item">
        <span class="legend-color" style="background: ${colors[index % colors.length]}"></span>
        <span>${item.label}: ${item.value} (${percentage}%)</span>
      </div>`;
    }).join('');

    const legendContainer = canvas.parentElement;
    const existingLegend = legendContainer.querySelector('.chart-legend');
    if (existingLegend) existingLegend.remove();
    
    legendContainer.insertAdjacentHTML('beforeend', `<div class="chart-legend">${legend}</div>`);
  }

  drawBarChart(canvasId, data) {
    const canvas = this.querySelector(`#${canvasId}`);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = 500;
    canvas.height = 400;

    const maxValue = Math.max(...data.map(d => d.value));
    const barWidth = 60;
    const chartHeight = canvas.height - 150;
    const startX = 60;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Get text color - use dark color in light mode, light color in dark mode
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDarkMode ? '#e0e0e0' : '#1a1a1a';
    ctx.fillStyle = textColor;
    ctx.font = '12px sans-serif';

    data.forEach((item, index) => {
      const barHeight = maxValue > 0 ? (item.value / maxValue) * chartHeight : 0;
      const x = startX + index * (barWidth + 20);
      const y = canvas.height - 130 - barHeight;

      // Draw bar
      ctx.fillStyle = '#0078d4';
      ctx.fillRect(x, y, barWidth, barHeight);

      // Draw value on top
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(item.value.toString(), x + barWidth / 2, y - 8);

      // Draw label at bottom (rotated)
      ctx.save();
      ctx.fillStyle = textColor;
      ctx.translate(x + barWidth / 2, canvas.height - 20);
      ctx.rotate(-0.5);
      ctx.textAlign = 'right';
      ctx.font = '11px sans-serif';
      ctx.fillText(item.label, 0, 0);
      ctx.restore();
    });
  }

  drawHorizontalBarChart(canvasId, data) {
    const canvas = this.querySelector(`#${canvasId}`);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const itemHeight = 45;
    canvas.width = 500;
    canvas.height = Math.max(data.length * itemHeight + 40, 150);

    const maxValue = Math.max(...data.map(d => d.value));
    const labelWidth = 180;
    const maxBarWidth = canvas.width - labelWidth - 80;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary').trim();
    ctx.fillStyle = textColor;
    ctx.font = '12px sans-serif';

    data.forEach((item, index) => {
      const barWidth = maxValue > 0 ? (item.value / maxValue) * maxBarWidth : 0;
      const y = 30 + index * itemHeight;

      // Draw label
      ctx.textAlign = 'right';
      ctx.fillStyle = textColor;
      ctx.fillText(item.label.substring(0, 35), labelWidth, y + 18);

      // Draw bar
      ctx.fillStyle = '#00b294';
      ctx.fillRect(labelWidth + 10, y, barWidth, 30);

      // Draw value
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(item.value.toString(), labelWidth + 15 + barWidth, y + 18);
      ctx.font = '12px sans-serif';
    });
  }

  renderTopStats() {
    const container = this.querySelector('#top-stats-grid');
    if (!container || !this.stats) return;

    const { topStats } = this.stats;

    const renderList = (items, title) => `
      <div class="card">
        <div class="card-header"><h4>${title}</h4></div>
        <div class="card-body">
          <ul class="top-list">
            ${items.map((item, index) => `
              <li>
                <span class="rank">${index + 1}.</span>
                <span class="name">${item.name}</span>
                <span class="count">${item.count}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    `;

    const sections = [];
    if (topStats.topSharers && topStats.topSharers.length > 0) {
      sections.push(renderList(topStats.topSharers, '<i class="fa-solid fa-user icon-purple"></i> Top Users'));
    }
    if (topStats.topRecipients && topStats.topRecipients.length > 0) {
      sections.push(renderList(topStats.topRecipients, '<i class="fa-solid fa-user-group icon-teal"></i> Top Users Shared With'));
    }
    if (topStats.topSites && topStats.topSites.length > 0) {
      sections.push(renderList(topStats.topSites, '<i class="fa-solid fa-location-dot icon-blue"></i> Top Sites'));
    }

    container.innerHTML = sections.join('') || '<p class="text-center">No ranking data available</p>';
  }

  renderTreeView() {
    const container = this.querySelector('#tree-view');
    if (!container || !this.stats) return;

    const { treeData } = this.stats;

    const renderNode = (node, level = 0) => {
      const indent = level * 20;
      const icon = {
        'site': '<i class="fa-solid fa-building icon-blue"></i>',
        'library': '<i class="fa-solid fa-book icon-purple"></i>',
        'folder': '<i class="fa-solid fa-folder icon-amber"></i>',
        'file': '<i class="fa-solid fa-file icon-teal"></i>'
      }[node.type] || '<i class="fa-solid fa-file icon-teal"></i>';

      const displayName = decodeSharePointPath(node.name);

      const badges = [];
      if (node.anonymousCount > 0) badges.push(`<span class="badge badge-danger">${node.anonymousCount} anonymous</span>`);
      if (node.neverExpiresCount > 0) badges.push(`<span class="badge badge-warning">${node.neverExpiresCount} never expires</span>`);
  const hasChildren = node.children && node.children.length > 0;
  const toggleIcon = hasChildren ? '▶' : '';
      
      // Add link for items with sharedLink and originalItem
      const itemLink = (node.sharedLink && node.originalItem) ? `<a href="#" class="tree-link" data-has-detail="true" title="View details"><i class="fa-solid fa-info-circle"></i></a> <a href="${node.sharedLink}" target="_blank" rel="noopener noreferrer" class="tree-link" title="Open in SharePoint"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : '';

      let html = `
        <div class="tree-node" style="margin-left: ${indent}px;" data-type="${node.type}" data-has-children="${hasChildren}" data-original-item='${node.originalItem ? JSON.stringify(node.originalItem).replace(/'/g, '&apos;') : ''}'>
          <span class="tree-toggle">${toggleIcon}</span>
          <span class="tree-icon">${icon}</span>
          <span class="tree-name">${displayName}</span>
          ${itemLink}
          <span class="tree-count">${node.linkCount} links</span>
          ${badges.join(' ')}
        </div>
      `;

      if (hasChildren) {
        html += `<div class="tree-children" style="display:none;">`;
        node.children.forEach(child => {
          html += renderNode(child, level + 1);
        });
        html += `</div>`;
      }

      return html;
    };

    container.innerHTML = treeData.map(node => renderNode(node)).join('');

    container.querySelectorAll('.tree-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        const node = e.target.closest('.tree-node');
        const children = node.nextElementSibling;
        if (children && children.classList.contains('tree-children')) {
          const isVisible = children.style.display !== 'none';
          children.style.display = isVisible ? 'none' : 'block';
          toggle.textContent = isVisible ? '▶' : '▼';
        }
      });
    });

    // Add click handler for detail view links in tree
    container.querySelectorAll('.tree-link[data-has-detail]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const treeNode = e.target.closest('.tree-node');
        const itemJson = treeNode.getAttribute('data-original-item');
        if (itemJson) {
          try {
            const item = JSON.parse(itemJson);
            this.showDetailView(item);
          } catch (error) {
            console.error('Failed to parse item data:', error);
          }
        }
      });
    });
  }

  renderSecurityInsights() {
    const container = this.querySelector('#security-insights');
    if (!container || !this.stats) return;

    const { securityInsights } = this.stats;

    const renderInsightSection = (title, items, icon) => `
      <div class="card">
        <div class="card-header">
          <h4>${icon} ${title} (${items.length})</h4>
        </div>
        <div class="card-body">
          ${items.length === 0 ? '<p class="text-center">No items found</p>' : `
            <table class="insight-table">
              <thead>
                <tr>
                  <th>File/Folder</th>
                  <th>Site</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${items.slice(0, 50).map(item => `
                  <tr>
                    <td>${item['File/Folder Name']}</td>
                    <td>${item['Site Name']}</td>
                    <td><span class="badge">${item['Link Type']}</span></td>
                    <td><span class="badge badge-${item['Link Status'] === 'Active' ? 'success' : 'danger'}">${item['Link Status']}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            ${items.length > 50 ? `<p class="text-center">... en ${items.length - 50} meer</p>` : ''}
          `}
        </div>
      </div>
    `;

    container.innerHTML = `
      ${renderInsightSection('Anonymous Links', securityInsights.anonymousLinks, '<i class="fa-solid fa-globe icon-blue"></i>')}
      ${renderInsightSection('Links that Never Expire', securityInsights.neverExpiringLinks, '<i class="fa-solid fa-infinity icon-amber"></i>')}
      ${renderInsightSection('Password Protected', securityInsights.passwordProtected, '<i class="fa-solid fa-lock icon-purple"></i>')}
      ${renderInsightSection('Download Blocked', securityInsights.downloadBlocked, '<i class="fa-solid fa-ban icon-pink"></i>')}
      ${renderInsightSection('Expires Soon (30 days)', securityInsights.soonToExpire, '<i class="fa-solid fa-clock icon-teal"></i>')}
    `;
  }

  /**
   * Normalizes values for table sorting, ensuring comparable lowercase strings and parsed dates.
   * @param {object} item - Current row item.
   * @param {string} field - Display field name to sort on.
   * @returns {string|number} Normalized value for comparison.
   */
  getSortValue(item, field) {
    if (!item) return '';
    const value = item[field];
    if (value === undefined || value === null) return '';

    if (field === 'Library') {
      return decodeSharePointPath(value).toLowerCase();
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const parsedDate = Date.parse(value);
      if (!Number.isNaN(parsedDate)) {
        return parsedDate;
      }
      return value.toLowerCase();
    }

    return value;
  }

  renderDetailsTable() {
    const container = this.querySelector('#details-table');
    if (!container || !this.rawData) return;

    const searchInput = this.querySelector('#details-search');
    const filterLinkType = this.querySelector('#filter-link-type');
    const filterStatus = this.querySelector('#filter-status');

    let sortField = null;
    let sortDirection = 'asc';

    const sortMapping = {
      'file': 'File/Folder Name',
      'site': 'Site Name',
      'library': 'Library',
      'type': 'Link Type',
      'access': 'Access Type',
      'status': 'Link Status',
      'expires': 'Friendly Expiry Time'
    };

    const compareValues = (a, b) => {
      if (!sortField) return 0;
      const valA = this.getSortValue(a, sortField);
      const valB = this.getSortValue(b, sortField);
      const bothNumbers = typeof valA === 'number' && typeof valB === 'number';
      const normA = bothNumbers ? valA : String(valA);
      const normB = bothNumbers ? valB : String(valB);
      if (normA === normB) return 0;
      const result = normA > normB ? 1 : -1;
      return sortDirection === 'asc' ? result : -result;
    };

    const renderSortIndicator = (key) => {
      const field = sortMapping[key];
      const isActive = sortField === field;
      const direction = isActive && sortDirection === 'desc' ? '▼' : '▲';
      const classes = `sort-indicator${isActive ? ' sort-indicator--active' : ''}`;
      return `<span class="${classes}" aria-hidden="true">${direction}</span>`;
    };

    const renderTable = (data) => {
      const sorted = sortField ? [...data].sort(compareValues) : [...data];
      const displayData = sorted.slice(0, 100);

      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th class="sortable" data-sort="file">File/Folder ${renderSortIndicator('file')}</th>
              <th class="sortable" data-sort="site">Site ${renderSortIndicator('site')}</th>
              <th class="sortable" data-sort="library">Library ${renderSortIndicator('library')}</th>
              <th class="sortable" data-sort="type">Type ${renderSortIndicator('type')}</th>
              <th class="sortable" data-sort="access">Access ${renderSortIndicator('access')}</th>
              <th class="sortable" data-sort="status">Status ${renderSortIndicator('status')}</th>
              <th class="sortable" data-sort="expires">Expires ${renderSortIndicator('expires')}</th>
              <th style="max-width: 200px;">Users</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${displayData.map((item, index) => {
              const sharedLink = item['Shared Link'];
              const users = item['Users'] || '-';
              const userList = users !== '-' ? users.split(',') : [];
              const truncatedUsers = userList.length > 2 
                ? `${userList.slice(0, 2).join(', ')} <span class="badge badge-secondary" title="${users}">+${userList.length - 2} more</span>`
                : users;
              
              return `
              <tr class="clickable-row" data-index="${index}" style="cursor: pointer;">
                <td>${item['File/Folder Name']}</td>
                <td>${item['Site Name']}</td>
                <td>${decodeSharePointPath(item['Library'])}</td>
                <td><span class="badge">${item['Link Type']}</span></td>
                <td><span class="badge">${item['Access Type']}</span></td>
                <td><span class="badge badge-${item['Link Status'] === 'Active' ? 'success' : 'danger'}">${item['Link Status']}</span></td>
                <td>${item['Friendly Expiry Time']}</td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${users}">${truncatedUsers}</td>
                <td onclick="event.stopPropagation();">
                  ${sharedLink ? `
                    <a href="${sharedLink}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary" title="Open shared link (click '...' → Manage Access in SharePoint)">
                      <i class="fa-solid fa-arrow-up-right-from-square"></i> Open
                    </a>
                  ` : '-'}
                </td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
        ${data.length > 100 ? `<p class="text-center">Showing 100 of ${data.length} results</p>` : ''}
      `;
      
      // Add click listeners to rows
      container.querySelectorAll('.clickable-row').forEach(row => {
        row.addEventListener('click', (e) => {
          const index = parseInt(row.dataset.index);
          const item = displayData[index];
          this.showDetailView(item);
        });
      });

      container.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const key = th.getAttribute('data-sort');
          const field = sortMapping[key];
          if (!field) return;
          if (sortField === field) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            sortField = field;
            sortDirection = 'asc';
          }
          applyFilters();
        });
      });
    };

    const applyFilters = () => {
      const filters = {
        linkType: filterLinkType?.value,
        linkStatus: filterStatus?.value,
        searchTerm: searchInput?.value
      };
      const filtered = this.processor.filterData(filters);
      renderTable(filtered);
    };

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (filterLinkType) filterLinkType.addEventListener('change', applyFilters);
    if (filterStatus) filterStatus.addEventListener('change', applyFilters);

    renderTable(this.rawData);
  }

  exportData(format) {
    if (!this.rawData) return;

    let content, filename, type;

    if (format === 'csv') {
      const headers = Object.keys(this.rawData[0]);
      const csvRows = [headers.join(',')];
      
      this.rawData.forEach(row => {
        const values = headers.map(header => {
          const value = row[header] || '';
          return `"${value.toString().replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(','));
      });

      content = csvRows.join('\n');
      filename = `sharepoint-links-export-${Date.now()}.csv`;
      type = 'text/csv';
    } else {
      content = JSON.stringify(this.rawData, null, 2);
      filename = `sharepoint-links-export-${Date.now()}.json`;
      type = 'application/json';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  showDetailView(item) {
    const detailContainer = this.querySelector('#detail-view');
    if (!detailContainer) return;

    // Format days to expiry into human-readable text
    const formatExpiryDays = (daysStr, status, friendlyTime) => {
      if (friendlyTime === 'Never Expires' || daysStr === 'N/A' || daysStr === '-') return 'Never expires';
      
      const days = parseInt(daysStr);
      if (isNaN(days)) return 'Unknown';
      
      if (status === 'Expired') {
        if (days === 0) return 'Expired today';
        if (days === -1) return 'Expired 1 day ago';
        return `Expired ${Math.abs(days)} days ago`;
      }
      
      if (days === 0) return 'Expires today';
      if (days === 1) return 'Expires in 1 day';
      return `Expires in ${days} days`;
    };

    const users = item['Users'] || 'None';
    const userList = users !== 'None' ? users.split(',').map(u => u.trim()) : [];

    // Determine brand (SharePoint vs OneDrive) from URL
    const fileUrl = item['File/Folder URL'] || '';
    const brandClass = (fileUrl.includes('-my.sharepoint.com') || fileUrl.includes('/personal/')) ? 'brand-onedrive' : 'brand-sharepoint';

    detailContainer.innerHTML = `
      <div class="detail-header">
        <h2><i class="fa-solid fa-${item['Object Type'] === 'File' ? 'file' : 'folder'} ${brandClass}"></i> ${item['File/Folder Name']}</h2>
      </div>
      
      <div class="detail-cards-grid">
        <div class="card">
          <div class="card-header"><h4><i class="fa-solid fa-info-circle"></i> General Information</h4></div>
          <div class="card-body">
            <div class="detail-row">
              <span class="detail-label">Object Type:</span>
              <span class="detail-value"><span class="badge">${item['Object Type']}</span></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">File Type:</span>
              <span class="detail-value">${item['File Type'] || 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Site:</span>
              <span class="detail-value">${item['Site Name']}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Library:</span>
              <span class="detail-value">${decodeSharePointPath(item['Library'])}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Path:</span>
              <span class="detail-value" style="word-break: break-all;">${item['File/Folder URL']}</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h4><i class="fa-solid fa-share-nodes"></i> Sharing Settings</h4></div>
          <div class="card-body">
            <div class="detail-row">
              <span class="detail-label">Link Type:</span>
              <span class="detail-value"><span class="badge badge-primary">${item['Link Type']}</span></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Access Type:</span>
              <span class="detail-value"><span class="badge badge-info">${item['Access Type']}</span></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Roles:</span>
              <span class="detail-value">${item['Roles'] || 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Password Protected:</span>
              <span class="detail-value"><span class="badge badge-${item['Password Protected'] === 'True' ? 'success' : 'secondary'}">${item['Password Protected']}</span></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Download Blocked:</span>
              <span class="detail-value"><span class="badge badge-${item['Block Download'] === 'True' ? 'warning' : 'secondary'}">${item['Block Download']}</span></span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h4><i class="fa-solid fa-clock"></i> Expiration</h4></div>
          <div class="card-body">
            <div class="detail-row">
              <span class="detail-label">Status:</span>
              <span class="detail-value"><span class="badge badge-${item['Link Status'] === 'Active' ? 'success' : 'danger'}">${item['Link Status']}</span></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Expiry Date:</span>
              <span class="detail-value">${item['Link Expiry Date'] || 'Never expires'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Days to/since Expiry:</span>
              <span class="detail-value">${formatExpiryDays(item['Days Since/To Expiry'], item['Link Status'], item['Friendly Expiry Time'])}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Friendly Time:</span>
              <span class="detail-value">${item['Friendly Expiry Time']}</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h4><i class="fa-solid fa-users"></i> Shared With</h4></div>
          <div class="card-body">
            ${userList.length > 0 ? `
              <ul class="user-list">
                ${userList.map(user => `<li><i class="fa-solid fa-user"></i> ${user}</li>`).join('')}
              </ul>
            ` : '<p class="text-muted">No specific users</p>'}
          </div>
        </div>

        <div class="card card-full-width">
          <div class="card-header"><h4><i class="fa-solid fa-link ${brandClass}"></i> Shared Link</h4></div>
          <div class="card-body">
            <div class="link-display">
              <input type="text" class="form-control" value="${item['Shared Link']}" readonly onclick="this.select()">
              <a href="${item['Shared Link']}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Link
              </a>
            </div>
          </div>
        </div>
      </div>
    `;

    // Capture origin tab to enable contextual back navigation
    const originTab = this.currentTab || 'list';
    this.detailBackTab = originTab;

    // Show detail tab and hide list/detail toggles appropriately
    this.switchTab('detail');
    const detailTabBtn = this.querySelector('[data-tab="detail"]');
    if (detailTabBtn) detailTabBtn.style.display = 'inline-block';

    // Configure back button (label + behavior) based on origin
    const backBtn = this.querySelector('#back-to-list');
    if (backBtn) {
      const labels = {
        dashboard: 'Back to Dashboard',
        tree: 'Back to Tree',
        list: 'Back to List'
      };
      const icons = {
        dashboard: 'fa-chart-pie',
        tree: 'fa-tree',
        list: 'fa-table'
      };
      const label = labels[originTab] || 'Back';
      const icon = icons[originTab] || 'fa-arrow-left';
      backBtn.innerHTML = `<i class="fa-solid fa-arrow-left"></i> ${label}`;

      // Remove prior listeners by cloning (simple pattern)
      const newBtn = backBtn.cloneNode(true);
      backBtn.parentNode.replaceChild(newBtn, backBtn);
      newBtn.addEventListener('click', () => {
        this.switchTab(this.detailBackTab);
        const detailTabBtn = this.querySelector('[data-tab="detail"]');
        if (detailTabBtn) detailTabBtn.style.display = 'none';
      });
    }
  }
}


customElements.define('data-analyzer-component', DataAnalyzerComponent);
