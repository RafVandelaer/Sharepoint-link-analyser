class AppGuideComponent extends HTMLElement {
  constructor() {
    super();
    this.checklist = {
      azureAccount: false,
      appRegistered: false,
      permissionsGranted: false,
      certificateSetup: false,
      scriptDownloaded: false
    };
  }

  connectedCallback() {
    this.render();
    this.attachEventListeners();
    this.updateCommandDisplay();
    // Listen for config changes from script-builder
    document.addEventListener('config-updated', () => this.updateCommandDisplay());
  }

  render() {
    this.innerHTML = `
      <div class="app-guide">
        <div class="guide-grid">
          <div class="guide-content">
            
            <div class="card">
              <div class="card-header">
                <h3>Entra ID App Registration</h3>
              </div>
              <div class="card-body">
                <div class="alert alert-info">
                  <strong>Note:</strong> You need Entra ID admin rights to register an app.
                </div>

                <div class="step-by-step">
                  <div class="guide-step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                      <h4>Open the Microsoft Entra admin center</h4>
                      <p>Go to <a href="https://entra.microsoft.com" target="_blank">entra.microsoft.com</a> and sign in with your admin account.</p>
                      <div class="form-check">
                        <input type="checkbox" id="check-azure-account" class="form-check-input">
                        <label for="check-azure-account" class="form-check-label">Signed in to Entra admin center</label>
                      </div>
                    </div>
                  </div>

                  <div class="guide-step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                      <h4>Register a new app</h4>
                      <ol>
                        <li>Click on <strong>Microsoft Entra ID</strong> in the menu</li>
                        <li>Select <strong>App registrations</strong> in the sidebar</li>
                        <li>Click on <strong>+ New registration</strong></li>
                        <li>Enter a name: e.g., "SharePoint Link Analyzer"</li>
                        <li>Choose <strong>Accounts in this organizational directory only</strong></li>
                        <li>Click on <strong>Register</strong></li>
                      </ol>
                      <div class="form-check">
                        <input type="checkbox" id="check-app-registered" class="form-check-input">
                        <label for="check-app-registered" class="form-check-label">App registered</label>
                      </div>
                    </div>
                  </div>

                  <div class="guide-step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                      <h4>Note the Application (client) ID</h4>
                      <p>On the Overview page of your app, copy the <strong>Application (client) ID</strong>. You can enter it below to include in the command.</p>
                      <div class="form-group">
                        <label class="form-label" for="app-client-id">Paste your Client ID here (optional)</label>
                        <input type="text" id="app-client-id" class="form-control" placeholder="00000000-0000-0000-0000-000000000000">
                      </div>
                    </div>
                  </div>

                  <div class="guide-step">
                    <div class="step-number">4</div>
                    <div class="step-content">
                      <h4>Configure API Permissions</h4>
                      <ol>
                        <li>Go to <strong>API permissions</strong> in the sidebar</li>
                        <li>Click on <strong>+ Add a permission</strong></li>
                        <li>Select <strong>Microsoft Graph</strong></li>
                        <li>Choose <strong>Application permissions</strong></li>
                        <li>Search and select:
                          <ul>
                            <li><code>Sites.Read.All</code></li>
                            <li><code>Files.Read.All</code></li>
                          </ul>
                        </li>
                        <li>Click on <strong>Add permissions</strong></li>
                        <li><strong>Important:</strong> Click on <strong>Grant admin consent for [your tenant]</strong></li>
                      </ol>
                      <div class="form-check">
                        <input type="checkbox" id="check-permissions-granted" class="form-check-input">
                        <label for="check-permissions-granted" class="form-check-label">Permissions added and admin consent granted</label>
                      </div>
                    </div>
                  </div>

                  <div class="guide-step">
                    <div class="step-number">5</div>
                    <div class="step-content">
                      <h4>Setup Authentication (Optional)</h4>
                      
                      <div class="auth-options">
                        <h5>Option A: Interactive Login (Easiest)</h5>
                        <p>No additional setup required. The script will open a browser window for authentication.</p>
                        
                        <h5>Option B: Certificate-based Auth (Most Secure)</h5>
                        <ol>
                          <li>Generate a self-signed certificate:
                            <pre><code>$cert = New-SelfSignedCertificate -Subject "CN=SPLinkAnalyzer" \\
  -CertStoreLocation "Cert:\\CurrentUser\\My" \\
  -KeyExportPolicy Exportable \\
  -KeySpec Signature \\
  -KeyLength 2048 \\
  -KeyAlgorithm RSA \\
  -HashAlgorithm SHA256

$cert.Thumbprint</code></pre>
                          </li>
                          <li>Upload the certificate to your Entra app registration:
                            <ul>
                              <li>Go to <strong>Certificates & secrets</strong></li>
                              <li>Click on <strong>Upload certificate</strong></li>
                              <li>Upload the .cer file</li>
                            </ul>
                          </li>
                          <li>Note the thumbprint of the certificate</li>
                        </ol>
                        <div class="form-check">
                          <input type="checkbox" id="check-certificate-setup" class="form-check-input">
                          <label for="check-certificate-setup" class="form-check-label">Certificate setup (or skip for interactive)</label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <h3>PnP PowerShell Module</h3>
              </div>
              <div class="card-body">
                <p>The script requires the PnP.PowerShell module (version 1.12.0+). It will be automatically installed if missing.</p>
                
                <h4>PowerShell Version</h4>
                <p>For optimal performance we recommend <strong>PowerShell 7+</strong>. This enables asynchronous processing.</p>
                
                <div class="code-block">
                  <h5>Install PowerShell 7 (optional but recommended):</h5>
                  <pre><code># Windows
winget install Microsoft.PowerShell

# macOS
brew install --cask powershell

# Linux (Ubuntu/Debian)
sudo apt-get install -y powershell</code></pre>
                </div>

                <div class="code-block">
                  <h5>Check your version:</h5>
                  <pre><code>$PSVersionTable.PSVersion</code></pre>
                </div>
              </div>
            </div>
          </div>

          <div class="guide-sidebar">
            <div class="card sticky-sidebar">
              <div class="card-header">
                <h3>Checklist & Downloads</h3>
              </div>
              <div class="card-body">
                <div class="checklist-progress">
                  <div class="progress-bar">
                    <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
                  </div>
                  <p class="progress-text"><span id="progress-count">0</span> of 5 completed</p>
                </div>

                <div class="checklist-items">
                  <div class="checklist-item" data-check="azureAccount">
                    <span class="check-icon fa-regular fa-square"></span>
                    <span>Entra admin access</span>
                  </div>
                  <div class="checklist-item" data-check="appRegistered">
                    <span class="check-icon fa-regular fa-square"></span>
                    <span>App registered</span>
                  </div>
                  <div class="checklist-item" data-check="permissionsGranted">
                    <span class="check-icon fa-regular fa-square"></span>
                    <span>Permissions added</span>
                  </div>
                  <div class="checklist-item" data-check="certificateSetup">
                    <span class="check-icon fa-regular fa-square"></span>
                    <span>Auth configured</span>
                  </div>
                  <div class="checklist-item" data-check="scriptDownloaded">
                    <span class="check-icon fa-regular fa-square"></span>
                    <span>Script downloaded</span>
                  </div>
                </div>

                <div class="action-buttons">
                  <button class="btn btn-primary w-100" id="download-script">
                    <i class="fa-solid fa-download"></i> Download Script
                  </button>
                  <button class="btn btn-secondary w-100" id="next-step-guide">
                    <i class="fa-solid fa-arrow-right"></i> Next Step
                  </button>
                </div>

                <div class="command-section">
                  <h4>PowerShell Command</h4>
                  <div class="command-preview">
                    <pre><code id="app-guide-command">pwsh ./GetAllSharingLinks.ps1 -TenantName "your-tenant" \
  -OutputFormat "Csv" \
  -ThrottleLimit 4</code></pre>
                  </div>
                </div>

                <div class="help-section">
                  <h4>Need help?</h4>
                  <p>Follow the steps carefully. If you encounter problems, check if you have admin rights in <strong>Microsoft Entra ID</strong>.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    // No basic configuration fields here anymore
    const checkboxes = [
      'check-azure-account',
      'check-app-registered',
      'check-permissions-granted',
      'check-certificate-setup'
    ];

    const checkboxMap = {
      'check-azure-account': 'azureAccount',
      'check-app-registered': 'appRegistered',
      'check-permissions-granted': 'permissionsGranted',
      'check-certificate-setup': 'certificateSetup'
    };

    checkboxes.forEach(id => {
      const checkbox = this.querySelector(`#${id}`);
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          this.checklist[checkboxMap[id]] = checkbox.checked;
          this.updateProgress();
        });
      }
    });

    const downloadButton = this.querySelector('#download-script');
    if (downloadButton) {
      downloadButton.addEventListener('click', () => this.downloadScript());
    }

    const clientIdInput = this.querySelector('#app-client-id');
    if (clientIdInput) {
      clientIdInput.addEventListener('input', () => this.updateCommandDisplay());
    }

    const nextButton = this.querySelector('#next-step-guide');
    if (nextButton) {
      nextButton.addEventListener('click', () => {
        window.app.navigateTo('step-3');
      });
    }
  }

  updateProgress() {
    const completed = Object.values(this.checklist).filter(Boolean).length;
    const total = Object.keys(this.checklist).length;
    const percentage = (completed / total) * 100;

    const progressFill = this.querySelector('#progress-fill');
    const progressCount = this.querySelector('#progress-count');

    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
    }

    if (progressCount) {
      progressCount.textContent = completed;
    }

    Object.entries(this.checklist).forEach(([key, value]) => {
      const item = this.querySelector(`.checklist-item[data-check="${key}"]`);
      if (item) {
        const icon = item.querySelector('.check-icon');
        if (value) {
          item.classList.add('checked');
          if (icon) {
            icon.classList.remove('fa-regular', 'fa-square');
            icon.classList.add('fa-solid', 'fa-square-check');
          }
        } else {
          item.classList.remove('checked');
          if (icon) {
            icon.classList.remove('fa-solid', 'fa-square-check');
            icon.classList.add('fa-regular', 'fa-square');
          }
        }
      }
    });
  }

  async downloadScript() {
    try {
      const response = await fetch('/scripts/GetAllSharingLinks.ps1');
      const scriptContent = await response.text();

      const blob = new Blob([scriptContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'GetAllSharingLinks.ps1';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);

      this.checklist.scriptDownloaded = true;
      this.updateProgress();

      const downloadButton = this.querySelector('#download-script');
      if (downloadButton) {
        const originalText = downloadButton.textContent;
        downloadButton.textContent = '✓ Downloaded!';
        downloadButton.classList.add('btn-success');
        
        setTimeout(() => {
          downloadButton.textContent = originalText;
          downloadButton.classList.remove('btn-success');
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to download script:', error);
      alert('Could not download script. Please copy it manually from the repository.');
    }
  }

  updateCommandDisplay() {
    const config = window.app?.getState('scriptConfig') || {};
    const commandElement = this.querySelector('#app-guide-command');
    if (!commandElement) return;

    const parts = ['pwsh ./GetAllSharingLinks.ps1'];

    if (config.tenantName) {
      parts.push(`-TenantName "${config.tenantName}"`);
    }

    // Get Client ID from this component's input field if available
    const clientIdInput = this.querySelector('#app-client-id');
    const clientId = clientIdInput?.value?.trim() || config.clientId;
    if (clientId) {
      parts.push(`-ClientId "${clientId}"`);
    }

    if (config.includeSites && config.includeSites.length > 0) {
      const sites = config.includeSites.map(s => `"${s}"`).join(',');
      parts.push(`-IncludeSites @(${sites})`);
    }

    if (config.excludeSites && config.excludeSites.length > 0) {
      const sites = config.excludeSites.map(s => `"${s}"`).join(',');
      parts.push(`-ExcludeSites @(${sites})`);
    }

    if (config.filters?.activeLinks) parts.push('-ActiveLinks');
    if (config.filters?.expiredLinks) parts.push('-ExpiredLinks');
    if (config.filters?.linksWithExpiration) parts.push('-LinksWithExpiration');
    if (config.filters?.neverExpiresLinks) parts.push('-NeverExpiresLinks');
    if (config.filters?.soonToExpireInDays >= 0) {
      parts.push(`-SoonToExpireInDays ${config.filters.soonToExpireInDays}`);
    }
    if (config.filters?.getAnyoneLinks) parts.push('-GetAnyoneLinks');
    if (config.filters?.getCompanyLinks) parts.push('-GetCompanyLinks');
    if (config.filters?.getSpecificPeopleLinks) parts.push('-GetSpecificPeopleLinks');

    parts.push(`-OutputFormat "${config.outputFormat || 'Csv'}"`);
    parts.push(`-ThrottleLimit ${config.throttleLimit || 4}`);

    if (config.outputPath) {
      parts.push(`-OutputPath "${config.outputPath}"`);
    }

    const command = parts.join(' \\\n  ');
    commandElement.textContent = command;
  }

}


customElements.define('app-guide-component', AppGuideComponent);
