class Router {
  constructor() {
    this.currentStep = null;
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('hashchange', () => this.handleRoute());
    document.addEventListener('DOMContentLoaded', () => this.handleRoute());
  }

  handleRoute() {
    const hash = window.location.hash.slice(1);
    const match = hash.match(/step-(\d)/);
    
    if (match) {
      this.navigateTo(hash);
    } else if (!this.currentStep) {
      this.showLanding();
    }
  }

  navigateTo(step) {
    const sections = document.querySelectorAll('.step-section, .landing-section');
    sections.forEach(section => section.style.display = 'none');

    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => link.classList.remove('active'));

    if (step === 'landing' || !step) {
      this.showLanding();
      return;
    }

    const targetSection = document.getElementById(step);
    if (targetSection) {
      targetSection.style.display = 'block';
      this.currentStep = step;
      
      window.location.hash = step;
      
      const activeLink = document.querySelector(`[data-step="${step.split('-')[1]}"]`);
      if (activeLink) {
        activeLink.classList.add('active');
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });

      this.trackPageView(step);
    }
  }

  showLanding() {
    const landingSection = document.getElementById('landing');
    if (landingSection) {
      landingSection.style.display = 'block';
      this.currentStep = null;
      window.location.hash = '';
      
      const navLinks = document.querySelectorAll('.nav-link');
      navLinks.forEach(link => link.classList.remove('active'));
    }
  }

  trackPageView(step) {
    if (window.analytics) {
      window.analytics.trackPageView(step);
    }
  }
}

class App {
  constructor() {
    this.router = new Router();
    this.state = {
      scriptConfig: null,
      analysisData: null
    };
    this.componentsReady = null;
    this.init();
  }

  async init() {
    await this.loadConfig();
    this.componentsReady = this.loadComponents();
    await this.componentsReady;
    this.setupGlobalHandlers();
  }

  async loadConfig() {
    try {
      const res = await fetch('/config');
      if (!res.ok) throw new Error('Failed to load config');
      const cfg = await res.json();
      window.APP_DEBUG = cfg.debug === true;
    } catch (err) {
      window.APP_DEBUG = false;
    }

  }

  async loadComponents() {
    const modules = [
      { name: 'script-builder', path: './components/script-builder.js' },
      { name: 'app-guide', path: './components/app-guide.js' },
      { name: 'data-analyzer', path: './components/data-analyzer.js' },
      { name: 'analytics', path: './services/analytics.js' }
    ];
    for (const m of modules) {
      try {
        await import(m.path);
        if (window.APP_DEBUG) {
          // eslint-disable-next-line no-console
          console.log(`Loaded module: ${m.name}`);
        }
      } catch (error) {
        console.error(`Failed to load module '${m.name}' from ${m.path}:`, error);
      }
    }
  }

  setupGlobalHandlers() {
    document.addEventListener('config-updated', (event) => {
      this.state.scriptConfig = event.detail;
    });

    document.addEventListener('analysis-complete', (event) => {
      this.state.analysisData = event.detail;
    });

    const bindDomReady = () => {
      const link = document.getElementById('github-link');
      const url = (window.APP_CONFIG && window.APP_CONFIG.githubUrl) || localStorage.getItem('githubUrl');
      if (link && url && typeof url === 'string' && url.startsWith('http')) {
        link.href = url;
      }

      const brand = document.getElementById('brand-link');
      if (brand) {
        brand.addEventListener('click', (e) => {
          e.preventDefault();
          this.navigateTo('landing');
        });
      }

      const startBtn = document.getElementById('start-analysis-btn');
      if (startBtn) {
        startBtn.addEventListener('click', () => this.navigateTo('step-1'));
      }

      const demoBtn = document.getElementById('demo-btn');
      if (demoBtn) {
        demoBtn.addEventListener('click', () => this.loadDemo());
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindDomReady, { once: true });
    } else {
      bindDomReady();
    }
  }

  navigateTo(step) {
    this.router.navigateTo(step);
  }

  setState(key, value) {
    this.state[key] = value;
    this.persistState();
  }

  getState(key) {
    return this.state[key];
  }

  persistState() {
    try {
      sessionStorage.setItem('app-state', JSON.stringify(this.state));
    } catch (error) {
      console.warn('Failed to persist state:', error);
    }
  }

  restoreState() {
    try {
      const stored = sessionStorage.getItem('app-state');
      if (stored) {
        this.state = { ...this.state, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Failed to restore state:', error);
    }
  }

  async loadDemo() {
    try {
      // Ensure components are loaded and custom element is defined
      if (this.componentsReady) {
        await this.componentsReady.catch(() => {});
      }
      if (customElements && customElements.whenDefined) {
        try {
          await customElements.whenDefined('data-analyzer-component');
        } catch (_) {
          /* ignore */
        }
      }

      // Generate synthetic demo data (no real tenant data used)
      const data = this.generateSyntheticData();

      // Get the data-analyzer component and load the data
      const analyzer = document.querySelector('data-analyzer-component');
      if (analyzer && typeof analyzer.loadDemoData === 'function') {
        analyzer.loadDemoData(data);
      } else {
        alert('Analyzer component is not ready yet. Please try again.');
        return;
      }

      // Navigate to step 3
      this.navigateTo('step-3');

      // Track the demo load
      if (window.analytics) {
        window.analytics.trackEvent('analysis_complete', { source: 'demo', type: 'synthetic' });
      }
    } catch (error) {
      console.error('Error loading demo:', error);
      alert('Could not load demo data. Please try again or upload a file manually.');
    }
  }

  generateSyntheticData() {
    const sites = ['HR', 'Marketing', 'Projects', 'Finance'];
    const libraries = ['Shared Documents', 'Site Assets', 'Shared%20Documents'];
    const folderNames = ['General', 'Policies', 'Templates', 'Current Year', 'Archive', 'Team Folders', 'Project Files'];
    const owners = ['john@contoso.com', 'alice@contoso.com', 'bob@contoso.com', 'carol@contoso.com'];
    const recipients = ['eva@contoso.com', 'max@contoso.com', 'mia@contoso.com', 'paul@contoso.com'];
    const fileTypes = ['docx', 'xlsx', 'pdf', 'pptx', 'jpg', 'txt', 'zip'];

    const rows = [];
    const today = new Date();

    function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    for (let i = 0; i < 60; i++) {
      const site = rand(sites);
      const library = rand(libraries);
      const isFile = Math.random() > 0.3;
      const objType = isFile ? 'File' : 'Folder';
      
      // Base URL with site name (remove spaces for URL)
      const siteUrlName = site.replace(/\s+/g, '');
      const baseUrl = `https://contoso.sharepoint.com/sites/${siteUrlName}/${library}`;
      
      // Create nested folder structure with URL encoding
      const folder1 = rand(folderNames);
      const folder2 = Math.random() > 0.4 ? rand(folderNames) : '';
      const folderPath = folder2 ? `${encodeURIComponent(folder1)}/${encodeURIComponent(folder2)}` : encodeURIComponent(folder1);
      
      // File name (if folder, use folder name, else use file)
      const fileName = isFile ? `Document${randInt(1, 100)}.${rand(fileTypes)}` : `Subfolder${randInt(1, 5)}`;
      const fileType = isFile ? fileName.split('.').pop() : '';
      const encodedFileName = encodeURIComponent(fileName);

      const linkType = rand(['Anonymous', 'Organization', 'Users']);
      const accessType = rand(['View', 'Edit']);
      const neverExpires = Math.random() < 0.2;
      
      let status, daysToExpiry, expiryDate, friendlyExpiry, expiryDateStr;
      
      if (neverExpires) {
        status = 'Active';
        daysToExpiry = 'N/A';
        expiryDateStr = '-';
        friendlyExpiry = 'Never Expires';
      } else {
        status = Math.random() > 0.15 ? 'Active' : 'Expired';
        daysToExpiry = status === 'Expired' ? -randInt(1, 120) : randInt(0, 180);
        expiryDate = status === 'Expired'
          ? new Date(today.getTime() - Math.abs(daysToExpiry) * 86400000)
          : new Date(today.getTime() + daysToExpiry * 86400000);
        expiryDateStr = expiryDate.toISOString().slice(0, 10);
        friendlyExpiry = `${daysToExpiry >= 0 ? 'In' : ''} ${Math.abs(daysToExpiry)} days`;
      }

      const users = linkType === 'Users' ? `${rand(recipients)}, ${rand(recipients)}` : '';
      const createdBy = rand(owners);
      const fileUrl = `${baseUrl}/${folderPath}/${encodedFileName}`;
      const sharedLink = `${fileUrl}?sharing=link${randInt(1000,9999)}`;

      rows.push({
        'Site Name': site,
        'Library': library,
        'Object Type': objType,
        'File/Folder Name': fileName,
        'File/Folder URL': fileUrl,
        'File Type': fileType,
        'Link Type': linkType,
        'Access Type': accessType,
        'Users': users,
        'Link Status': status,
        'Friendly Expiry Time': neverExpires ? 'Never Expires' : friendlyExpiry,
        'Days Since/To Expiry': daysToExpiry.toString(),
        'Link Expiry Date': expiryDateStr,
        'Created By': createdBy,
        'Shared Link': sharedLink
      });
    }

    return rows;
  }
}

const app = new App();
window.app = app;

export default app;
