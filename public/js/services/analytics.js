class Analytics {
  constructor() {
    this.apiUrl = '/api/analytics';
    this.sessionId = this.getOrCreateSessionId();
    this.csrfToken = null;
  }

  getOrCreateSessionId() {
    // Use localStorage instead of sessionStorage for persistence across page reloads
    let sessionId = localStorage.getItem('analytics-session');
    if (!sessionId) {
      // Generate valid UUIDv4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      // where x = random hex digit, y = (8|9|a|b) + random hex
      const generateUuidv4 = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };

      try {
        // Prefer native crypto.randomUUID if available
        sessionId = crypto.randomUUID();
      } catch (_) {
        sessionId = generateUuidv4();
      }
      localStorage.setItem('analytics-session', sessionId);
    }
    return sessionId;
  }

  async ensureCsrfToken() {
    if (this.csrfToken) return this.csrfToken;
    try {
      const res = await fetch('/api/csrf-token', {
        method: 'GET',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to get CSRF token');
      const body = await res.json();
      this.csrfToken = body.csrfToken;
      return this.csrfToken;
    } catch (err) {
      console.warn('CSRF token fetch failed:', err);
      return null;
    }
  }

  async trackEvent(eventName, data = {}) {
    const allowedEvents = ['page_view', 'file_uploaded', 'analysis_complete'];
    if (!allowedEvents.includes(eventName)) {
      return;
    }
    try {
      const payload = {
        event: eventName,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        data
      };

      const res = await fetch(`${this.apiUrl}/event`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorBody = await res.json();
        console.warn(`Analytics event failed (${res.status}):`, errorBody);
      }
    } catch (error) {
      console.warn('Analytics tracking failed:', error);
    }
  }

  async trackPageView(page) {
    await this.trackEvent('page_view', { page });
  }

  async trackFileUpload(fileType, fileSize) {
    await this.trackEvent('file_uploaded', { fileType, fileSize });
  }

  async trackAnalysisComplete(recordCount) {
    await this.trackEvent('analysis_complete', { recordCount });
  }

  async trackExport(format) {
    await this.trackEvent('export', { format });
  }
}

const analytics = new Analytics();
window.analytics = analytics;

export default analytics;
