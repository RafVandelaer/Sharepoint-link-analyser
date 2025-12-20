class ScriptBuilderComponent extends HTMLElement {
  constructor() {
    super();
    this.config = {
      tenantName: '',
      siteUrls: [],
      includeSites: [],
      excludeSites: [],
      clientId: '',
      certificateThumbprint: '',
      filters: {
        activeLinks: false,
        expiredLinks: false,
        linksWithExpiration: false,
        neverExpiresLinks: false,
        soonToExpireInDays: -1,
        getAnyoneLinks: false,
        getCompanyLinks: false,
        getSpecificPeopleLinks: false
      },
      outputFormat: 'Csv',
      throttleLimit: 4,
      outputPath: ''
    };
  }

  connectedCallback() {
    const existing = window.app?.getState('scriptConfig');
    if (existing) {
      this.config = { ...this.config, ...existing };
    }
    this.render();
    // Initialize form with any existing state
    const tenantEl = this.querySelector('#tenant-name');
    if (tenantEl && this.config.tenantName) tenantEl.value = this.config.tenantName;
    const includeEl = this.querySelector('#include-sites');
    if (includeEl && Array.isArray(this.config.includeSites)) includeEl.value = this.config.includeSites.join('\n');
    const excludeEl = this.querySelector('#exclude-sites');
    if (excludeEl && Array.isArray(this.config.excludeSites)) excludeEl.value = this.config.excludeSites.join('\n');
    this.attachEventListeners();
    this.updateCommandPreview();
  }

  render() {
    this.innerHTML = `
      <div class="script-builder">
        <div class="builder-grid">
          <div class="builder-form">

            <div class="card">
              <div class="card-header">
                <h3>Basic Configuration</h3>
              </div>
              <div class="card-body">
                <div class="form-group">
                  <label class="form-label" for="tenant-name">
                    Tenant Name *
                    <span class="help-text">e.g., 'contoso' for contoso.onmicrosoft.com</span>
                  </label>
                  <input 
                    type="text" 
                    id="tenant-name" 
                    class="form-control" 
                    placeholder="contoso"
                    required
                  >
                </div>

                <div class="form-group">
                  <label class="form-label" for="include-sites">
                    Include Sites (optional)
                    <span class="help-text">Add site URLs, one per line. If left empty, the script scans all sites. When provided, only the listed sites are scanned.</span>
                  </label>
                  <textarea 
                    id="include-sites" 
                    class="form-control" 
                    rows="3"
                    placeholder="https://contoso.sharepoint.com/sites/site-include-1&#10;https://contoso.sharepoint.com/sites/site-include-2"
                  ></textarea>
                </div>

                <div class="form-group">
                  <label class="form-label" for="exclude-sites">
                    Exclude Sites (optional)
                    <span class="help-text">Add site URLs, one per line to skip during scanning</span>
                  </label>
                  <textarea 
                    id="exclude-sites" 
                    class="form-control" 
                    rows="3"
                    placeholder="https://contoso.sharepoint.com/sites/site1&#10;https://contoso.sharepoint.com/sites/site2"
                  ></textarea>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <h3>Filter Options</h3>
              </div>
              <div class="card-body">
                <div class="filter-section">
                  <h4>Link Status</h4>
                  <div class="form-check">
                    <input type="checkbox" id="filter-active" class="form-check-input">
                    <label for="filter-active" class="form-check-label">Only active links</label>
                  </div>
                  <div class="form-check">
                    <input type="checkbox" id="filter-expired" class="form-check-input">
                    <label for="filter-expired" class="form-check-label">Only expired links</label>
                  </div>
                  <div class="form-check">
                    <input type="checkbox" id="filter-with-expiration" class="form-check-input">
                    <label for="filter-with-expiration" class="form-check-label">Links with expiration date</label>
                  </div>
                  <div class="form-check">
                    <input type="checkbox" id="filter-never-expires" class="form-check-input">
                    <label for="filter-never-expires" class="form-check-label">Links that never expire</label>
                  </div>
                  
                  <div class="form-group">
                    <label class="form-label" for="soon-expire-days">
                      Expires within X days
                    </label>
                    <input 
                      type="number" 
                      id="soon-expire-days" 
                      class="form-control" 
                      min="-1"
                      value="-1"
                      placeholder="-1 (disabled)"
                    >
                  </div>
                </div>

                <div class="filter-section">
                  <h4>Link Type</h4>
                  <div class="form-check">
                    <input type="checkbox" id="filter-anyone" class="form-check-input">
                    <label for="filter-anyone" class="form-check-label">Only anonymous links</label>
                  </div>
                  <div class="form-check">
                    <input type="checkbox" id="filter-company" class="form-check-input">
                    <label for="filter-company" class="form-check-label">Only organization links</label>
                  </div>
                  <div class="form-check">
                    <input type="checkbox" id="filter-specific" class="form-check-input">
                    <label for="filter-specific" class="form-check-label">Only specific people</label>
                  </div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <h3>Output Options</h3>
              </div>
              <div class="card-body">
                <div class="form-group">
                  <label class="form-label" for="output-format">Output Format</label>
                  <select id="output-format" class="form-control">
                    <option value="Csv">CSV</option>
                    <option value="Json">JSON</option>
                    <option value="Both">Both</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label" for="throttle-limit">
                    Parallel Threads (PowerShell 7+)
                    <span class="help-text">1-10, higher value = faster but more resources</span>
                  </label>
                  <input 
                    type="range" 
                    id="throttle-limit" 
                    class="form-range" 
                    min="1" 
                    max="10" 
                    value="4"
                  >
                  <div class="range-value">
                    <span id="throttle-value">4</span> threads
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label" for="output-path">
                    Output Path (optional)
                    <span class="help-text">Leave empty for default location</span>
                  </label>
                  <input 
                    type="text" 
                    id="output-path" 
                    class="form-control" 
                    placeholder="./reports"
                  >
                </div>
              </div>
            </div>
          </div>

          <div class="builder-preview">
            <div class="card sticky-preview">
              <div class="card-header">
                <h3>PowerShell Commando</h3>
              </div>
              <div class="card-body">
                <div class="command-preview">
                  <pre><code id="command-output">pwsh ./GetAllSharingLinks.ps1 -TenantName "your-tenant"</code></pre>
                </div>
                <div class="preview-actions">
                  <button class="btn btn-secondary w-100" id="next-step">
                    <i class="fa-solid fa-arrow-right"></i> Next Step
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    const inputs = [
      'tenant-name', 'include-sites', 'exclude-sites',
      'filter-active', 'filter-expired', 'filter-with-expiration', 'filter-never-expires',
      'soon-expire-days', 'filter-anyone', 'filter-company', 'filter-specific',
      'output-format', 'throttle-limit', 'output-path'
    ];

    inputs.forEach(id => {
      const element = this.querySelector(`#${id}`);
      if (element) {
        element.addEventListener('input', () => this.updateConfig());
        element.addEventListener('change', () => this.updateConfig());
      }
    });

    const throttleSlider = this.querySelector('#throttle-limit');
    const throttleValue = this.querySelector('#throttle-value');
    if (throttleSlider && throttleValue) {
      throttleSlider.addEventListener('input', (e) => {
        throttleValue.textContent = e.target.value;
      });
    }

    const nextButton = this.querySelector('#next-step');
    if (nextButton) {
      nextButton.addEventListener('click', () => {
        window.app.navigateTo('step-2');
      });
    }

    this.updateConfig();
  }

  updateConfig() {
    const tenantEl = this.querySelector('#tenant-name');
    const includeEl = this.querySelector('#include-sites');
    const excludeEl = this.querySelector('#exclude-sites');

    if (tenantEl) this.config.tenantName = tenantEl.value || '';
    if (includeEl) {
      const includeSitesText = includeEl.value || '';
      this.config.includeSites = includeSitesText
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    }
    if (excludeEl) {
      const excludeSitesText = excludeEl.value || '';
      this.config.excludeSites = excludeSitesText
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    }

    this.config.filters.activeLinks = this.querySelector('#filter-active')?.checked || false;
    this.config.filters.expiredLinks = this.querySelector('#filter-expired')?.checked || false;
    this.config.filters.linksWithExpiration = this.querySelector('#filter-with-expiration')?.checked || false;
    this.config.filters.neverExpiresLinks = this.querySelector('#filter-never-expires')?.checked || false;
    this.config.filters.soonToExpireInDays = parseInt(this.querySelector('#soon-expire-days')?.value || '-1');
    this.config.filters.getAnyoneLinks = this.querySelector('#filter-anyone')?.checked || false;
    this.config.filters.getCompanyLinks = this.querySelector('#filter-company')?.checked || false;
    this.config.filters.getSpecificPeopleLinks = this.querySelector('#filter-specific')?.checked || false;

    this.config.outputFormat = this.querySelector('#output-format')?.value || 'Csv';
    this.config.throttleLimit = parseInt(this.querySelector('#throttle-limit')?.value || '4');
    this.config.outputPath = this.querySelector('#output-path')?.value || '';

    this.updateCommandPreview();
    
    this.dispatchEvent(new CustomEvent('config-updated', {
      detail: this.config,
      bubbles: true,
      composed: true
    }));
  }

  updateCommandPreview() {
    const parts = ['pwsh ./GetAllSharingLinks.ps1'];

    if (this.config.tenantName) {
      parts.push(`-TenantName "${this.config.tenantName}"`);
    }

    if (this.config.includeSites && this.config.includeSites.length > 0) {
      const sites = this.config.includeSites.map(s => `"${s}"`).join(',');
      parts.push(`-IncludeSites @(${sites})`);
    }

    if (this.config.excludeSites.length > 0) {
      const sites = this.config.excludeSites.map(s => `"${s}"`).join(',');
      parts.push(`-ExcludeSites @(${sites})`);
    }

    if (this.config.filters.activeLinks) parts.push('-ActiveLinks');
    if (this.config.filters.expiredLinks) parts.push('-ExpiredLinks');
    if (this.config.filters.linksWithExpiration) parts.push('-LinksWithExpiration');
    if (this.config.filters.neverExpiresLinks) parts.push('-NeverExpiresLinks');
    if (this.config.filters.soonToExpireInDays >= 0) {
      parts.push(`-SoonToExpireInDays ${this.config.filters.soonToExpireInDays}`);
    }
    if (this.config.filters.getAnyoneLinks) parts.push('-GetAnyoneLinks');
    if (this.config.filters.getCompanyLinks) parts.push('-GetCompanyLinks');
    if (this.config.filters.getSpecificPeopleLinks) parts.push('-GetSpecificPeopleLinks');

    // Always include output format, even when default is Csv
    parts.push(`-OutputFormat "${this.config.outputFormat}"`);

    // Always include throttle limit, even when default (4), so it appears without slider interaction
    parts.push(`-ThrottleLimit ${this.config.throttleLimit}`);

    if (this.config.outputPath) {
      parts.push(`-OutputPath "${this.config.outputPath}"`);
    }

    // Prepare both multi-line (for readability) and single-line (for copying) variants
    const commandSingle = parts.join(' ');
    const commandMulti = parts.join(' \\\n  ');
    const outputElement = this.querySelector('#command-output');
    if (outputElement) {
      outputElement.textContent = commandMulti;
      outputElement.setAttribute('data-single', commandSingle);
    }
  }

}

customElements.define('script-builder-component', ScriptBuilderComponent);
