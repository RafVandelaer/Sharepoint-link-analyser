// Admin dashboard controller - extracted for CSP compliance
let lastUpdateTime = null;
let refreshInterval = null;

const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const refreshBtn = document.getElementById('refresh-btn');
const refreshIndicator = document.getElementById('refresh-indicator');
const lastUpdateSpan = document.getElementById('last-update');

// Fetch CSRF token for all POST requests
async function getCsrfToken() {
  try {
    const response = await fetch('/api/csrf-token');
    const data = await response.json();
    return data.csrfToken;
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error);
    return null;
  }
}

/**
 * Log in using dev secret (development) or password (production).
 * In dev, POST to /api/admin/dev-login with the secret.
 * In prod, POST to /api/admin/login with the password.
 */
async function login(secretOrPassword) {
  try {
    const csrfToken = await getCsrfToken();
    
    // Determine endpoint: assume dev if no CSRF (or we're in dev mode)
    const isDevMode = await isDevEnvironment();
    const endpoint = isDevMode ? '/api/admin/dev-login' : '/api/admin/login';
    const bodyKey = isDevMode ? 'secret' : 'password';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      },
      body: JSON.stringify({ [bodyKey]: secretOrPassword }),
      credentials: 'include'  // Include cookies
    });

    if (response.ok) {
      // Token is now in httpOnly cookie, just show dashboard
      showDashboard();
    } else {
      const error = await response.json();
      loginError.textContent = error.error || 'Invalid credentials. Please try again.';
      loginError.style.display = 'block';
    }
  } catch (error) {
    console.error('Login error:', error);
    loginError.textContent = 'Login failed. Server error.';
    loginError.style.display = 'block';
  }
}

/**
 * Check if we're in development mode.
 */
async function isDevEnvironment() {
  try {
    const response = await fetch('/config');
    const data = await response.json();
    return typeof data.debug === 'boolean'; // Config endpoint indicates dev
  } catch {
    return false;
  }
}

async function logout() {
  try {
    const csrfToken = await getCsrfToken();
    
    await fetch('/api/admin/logout', {
      method: 'POST',
      headers: { ...(csrfToken && { 'X-CSRF-Token': csrfToken }) },
      credentials: 'include'
    });
  } catch (error) {
    console.error('Logout error:', error);
  }
  
  if (refreshInterval) clearInterval(refreshInterval);
  loginView.style.display = 'block';
  dashboardView.style.display = 'none';
}

async function loadAnalytics() {
  refreshIndicator.classList.add('loading');
  refreshIndicator.querySelector('i').classList.remove('fa-clock');
  refreshIndicator.querySelector('i').classList.add('fa-spinner');
  
  try {
    const response = await fetch('/api/admin/analytics', {
      method: 'GET',
      credentials: 'include'  // Include cookies (httpOnly token)
    });

    if (!response.ok) {
      if (response.status === 401) {
        logout();
      }
      throw new Error('Failed to load analytics');
    }

    const data = await response.json();
    console.log('Analytics data loaded:', data);
    renderDashboard(data);
    lastUpdateTime = new Date();
    updateLastUpdateText();
  } catch (error) {
    console.error('Analytics load error:', error);
  } finally {
    refreshIndicator.classList.remove('loading');
    refreshIndicator.querySelector('i').classList.remove('fa-spinner');
    refreshIndicator.querySelector('i').classList.add('fa-clock');
  }
}

function updateLastUpdateText() {
  if (!lastUpdateTime) return;
  
  const now = new Date();
  const seconds = Math.floor((now - lastUpdateTime) / 1000);
  
  if (seconds < 60) {
    lastUpdateSpan.textContent = 'Just now';
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    lastUpdateSpan.textContent = `${minutes}m ago`;
  } else {
    lastUpdateSpan.textContent = lastUpdateTime.toLocaleTimeString();
  }
}

function getTextColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary').trim();
}

function getSecondaryTextColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim();
}

function renderDashboard(data) {
  const metricsGrid = document.getElementById('metrics-grid');
  
  // Calculate proper counts from events (accounting for both naming conventions)
  const fileUploads = data.events.filter(e => e.event === 'file_upload' || e.event === 'file_uploaded').length;
  const analysisRuns = data.events.filter(e => e.event === 'analysis_complete').length;
  
  metricsGrid.innerHTML = `
    <div class="metric-card" style="border-left: 4px solid #0078d4;">
      <i class="fa-solid fa-chart-simple metric-card-icon" style="color: #0078d4;"></i>
      <div class="metric-label" style="color: #0078d4;">Total Events</div>
      <div class="metric-value" style="color: #0078d4;">${data.summary.totalEvents.toLocaleString()}</div>
    </div>
    <div class="metric-card" style="border-left: 4px solid #00b294;">
      <i class="fa-solid fa-eye metric-card-icon" style="color: #00b294;"></i>
      <div class="metric-label" style="color: #00b294;">Page Views</div>
      <div class="metric-value" style="color: #00b294;">${data.summary.pageViews.toLocaleString()}</div>
    </div>
    <div class="metric-card" style="border-left: 4px solid #8764b8;">
      <i class="fa-solid fa-file-arrow-up metric-card-icon" style="color: #8764b8;"></i>
      <div class="metric-label" style="color: #8764b8;">File Uploads</div>
      <div class="metric-value" style="color: #8764b8;">${fileUploads.toLocaleString()}</div>
    </div>
    <div class="metric-card" style="border-left: 4px solid #ff8c00;">
      <i class="fa-solid fa-magnifying-glass-chart metric-card-icon" style="color: #ff8c00;"></i>
      <div class="metric-label" style="color: #ff8c00;">Analysis Runs</div>
      <div class="metric-value" style="color: #ff8c00;">${analysisRuns.toLocaleString()}</div>
    </div>
    <div class="metric-card" style="border-left: 4px solid #107c10;">
      <i class="fa-solid fa-users metric-card-icon" style="color: #107c10;"></i>
      <div class="metric-label" style="color: #107c10;">Unique Sessions</div>
      <div class="metric-value" style="color: #107c10;">${data.uniqueSessions.toLocaleString()}</div>
    </div>
  `;

  renderDailyChart(data.dailyStats);
  renderEventsChart(data.eventTypes);
  renderEventsTable(data.recentEvents);
}

function renderDailyChart(dailyStats) {
  const canvas = document.getElementById('daily-chart');
  const ctx = canvas.getContext('2d');
  
  const dates = Object.keys(dailyStats).sort().slice(-30);
  const pageViews = dates.map(date => dailyStats[date].pageViews || 0);
  const uploads = dates.map(date => dailyStats[date].fileUploads || 0);
  const analyses = dates.map(date => dailyStats[date].analysisRuns || 0);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const maxValue = Math.max(...pageViews, ...uploads, ...analyses, 1);
  const barWidth = Math.max(10, (canvas.width - 150) / dates.length / 3);
  const chartHeight = canvas.height - 100;
  const textColor = getTextColor();

  ctx.fillStyle = textColor;
  ctx.font = '11px sans-serif';

  dates.forEach((date, index) => {
    const x = 80 + index * (barWidth * 3 + 10);
    
    // Page views
    const pvHeight = (pageViews[index] / maxValue) * chartHeight;
    ctx.fillStyle = '#0078d4';
    ctx.fillRect(x, canvas.height - 80 - pvHeight, barWidth, pvHeight);

    // Uploads
    const upHeight = (uploads[index] / maxValue) * chartHeight;
    ctx.fillStyle = '#00b294';
    ctx.fillRect(x + barWidth, canvas.height - 80 - upHeight, barWidth, upHeight);

    // Analyses
    const anHeight = (analyses[index] / maxValue) * chartHeight;
    ctx.fillStyle = '#8764b8';
    ctx.fillRect(x + barWidth * 2, canvas.height - 80 - anHeight, barWidth, anHeight);

    // Date label (every 5th)
    if (index % 5 === 0 || index === dates.length - 1) {
      ctx.fillStyle = textColor;
      ctx.save();
      ctx.translate(x + barWidth * 1.5, canvas.height - 55);
      ctx.rotate(-Math.PI / 6);
      ctx.textAlign = 'right';
      ctx.fillText(date.substring(5), 0, 0);
      ctx.restore();
    }
  });

  // Legend
  const legendY = 25;
  ctx.fillStyle = '#0078d4';
  ctx.fillRect(20, legendY, 15, 15);
  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.fillText('Page Views', 40, legendY + 12);

  ctx.fillStyle = '#00b294';
  ctx.fillRect(130, legendY, 15, 15);
  ctx.fillStyle = textColor;
  ctx.fillText('Uploads', 150, legendY + 12);

  ctx.fillStyle = '#8764b8';
  ctx.fillRect(220, legendY, 15, 15);
  ctx.fillStyle = textColor;
  ctx.fillText('Analyses', 240, legendY + 12);
}

function renderEventsChart(eventTypes) {
  const canvas = document.getElementById('events-chart');
  const ctx = canvas.getContext('2d');

  const entries = Object.entries(eventTypes).filter(([, count]) => count > 0);
  if (entries.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = getTextColor();
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No events yet', canvas.width / 2, canvas.height / 2);
    return;
  }

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const colors = ['#0078d4', '#00b294', '#8764b8', '#ff8c00', '#d13438', '#00b7c3'];
  const textColor = getTextColor();

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let currentAngle = -Math.PI / 2;
  const centerX = 220;
  const centerY = 175;
  const radius = 120;

  entries.forEach(([event, count], index) => {
    const sliceAngle = (count / total) * 2 * Math.PI;
    
    ctx.fillStyle = colors[index % colors.length];
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
    ctx.closePath();
    ctx.fill();

    // Label percentage on slice
    const labelAngle = currentAngle + sliceAngle / 2;
    const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
    const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
    
    const percentage = ((count / total) * 100).toFixed(1);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${percentage}%`, labelX, labelY);

    currentAngle += sliceAngle;
  });

  // Legend
  let legendY = 30;
  entries.forEach(([event, count], index) => {
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(20, legendY, 18, 18);
    ctx.fillStyle = textColor;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    const displayEvent = event.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    ctx.fillText(`${displayEvent}: ${count}`, 45, legendY + 14);
    legendY += 30;
  });
}

function renderEventsTable(events) {
  const tbody = document.querySelector('#events-table tbody');
  tbody.innerHTML = events.slice(0, 100).map(event => {
    const eventType = event.event.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const dataStr = event.data ? JSON.stringify(event.data) : '{}';
    
    return `
      <tr>
        <td>${new Date(event.timestamp).toLocaleString()}</td>
        <td><span class="badge badge-info">${eventType}</span></td>
        <td><span class="session-id">${event.sessionId.substring(0, 20)}...</span></td>
        <td><span class="event-data" title="${dataStr}">${dataStr}</span></td>
      </tr>
    `;
  }).join('');
}

function showDashboard() {
  loginView.style.display = 'none';
  dashboardView.style.display = 'block';
  loadAnalytics();
  
  // Auto-refresh every 30 seconds
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    loadAnalytics();
  }, 30000);
  
  // Update "last updated" text every 10 seconds
  setInterval(updateLastUpdateText, 10000);
}

// Initialize theme toggle
function initThemeToggle() {
  const html = document.documentElement;
  
  function getInitialTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }
  
  const initialTheme = getInitialTheme();
  html.setAttribute('data-theme', initialTheme);
  
  function updateThemeIcon(theme) {
    const icons = [
      document.getElementById('theme-icon-login'),
      document.getElementById('theme-icon-dash')
    ];
    icons.forEach(icon => {
      if (!icon) return;
      icon.classList.remove('fa-moon','fa-sun');
      icon.classList.add(theme === 'light' ? 'fa-sun' : 'fa-moon');
    });
  }
  
  updateThemeIcon(initialTheme);
  
  function toggleTheme() {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    // Re-render charts with new colors
    if (dashboardView.style.display === 'block') {
      setTimeout(() => loadAnalytics(), 100);
    }
  }
  
  const toggleLogin = document.getElementById('theme-toggle-login');
  const toggleDash = document.getElementById('theme-toggle-dash');
  
  if (toggleLogin) toggleLogin.addEventListener('click', toggleTheme);
  if (toggleDash) toggleDash.addEventListener('click', toggleTheme);
}

// Event listeners
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const secret = document.getElementById('admin-token').value;
  login(secret);
});

logoutBtn.addEventListener('click', logout);
refreshBtn.addEventListener('click', () => {
  loadAnalytics();
});

// Initialize
initThemeToggle();
