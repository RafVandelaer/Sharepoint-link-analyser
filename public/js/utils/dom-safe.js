/**
 * Safe HTML rendering utilities to prevent XSS attacks
 * Use these instead of innerHTML when rendering user/CSV data
 */

/**
 * Create a text node safely (no HTML parsing)
 */
export function createSafeText(content) {
  const el = document.createElement('span');
  el.textContent = String(content);
  return el;
}

/**
 * Create an element with safe text content and attributes
 */
export function createSafeElement(tag, content, attributes = {}, classes = []) {
  const el = document.createElement(tag);
  if (content) {
    el.textContent = String(content);
  }
  
  // Set data attributes safely
  Object.entries(attributes).forEach(([key, value]) => {
    if (key.startsWith('data-')) {
      el.dataset[key.slice(5)] = String(value);
    } else if (!key.startsWith('on')) {
      el.setAttribute(key, String(value));
    }
  });
  
  // Add classes
  classes.forEach(cls => el.classList.add(cls));
  
  return el;
}

/**
 * Create a badge element safely
 */
export function createBadge(text, className = 'badge badge-primary') {
  const badge = document.createElement('span');
  badge.textContent = String(text);
  badge.className = className;
  return badge;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Validate that a URL is safe (no javascript: protocol)
 */
export function isSafeUrl(url) {
  if (!url) return false;
  const trimmed = String(url).trim().toLowerCase();
  return !trimmed.startsWith('javascript:') && 
         !trimmed.startsWith('data:text/html') &&
         (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/'));
}

/**
 * Create a link element safely
 */
export function createSafeLink(text, href, target = '_blank') {
  const link = document.createElement('a');
  link.textContent = String(text);
  
  if (isSafeUrl(href)) {
    link.href = String(href);
  }
  
  if (target === '_blank') {
    link.rel = 'noopener noreferrer';
  }
  link.target = target;
  
  return link;
}

export default {
  createSafeText,
  createSafeElement,
  createBadge,
  escapeHtml,
  isSafeUrl,
  createSafeLink
};
