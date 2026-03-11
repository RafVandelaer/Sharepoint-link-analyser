// Theme toggle functionality (moved from inline to satisfy CSP)
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const html = document.documentElement;

function getInitialTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) return savedTheme;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function updateThemeIcon(theme) {
  if (!themeIcon) return;
  themeIcon.classList.remove('fa-moon', 'fa-sun');
  themeIcon.classList.add(theme === 'light' ? 'fa-sun' : 'fa-moon');
}

const initialTheme = getInitialTheme();
html.setAttribute('data-theme', initialTheme);
updateThemeIcon(initialTheme);

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    try { localStorage.setItem('theme', newTheme); } catch {}
    updateThemeIcon(newTheme);
    
    if (window.APP_DEBUG) {
      console.log('Theme changed to:', newTheme);
    }
    // Dispatch event so components can update
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: newTheme } }));
  });
}
