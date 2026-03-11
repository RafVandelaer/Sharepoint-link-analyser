const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
const Joi = require('joi');

// Load .env in development without external dependencies
// Minimal parser: KEY=VALUE per line, ignores comments and empty lines
try {
  const envPath = __dirname + '/../.env';
  const fsRaw = require('fs');
  if (process.env.NODE_ENV !== 'production' && fsRaw.existsSync(envPath)) {
    const content = fsRaw.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
        val = val.slice(1, -1);
      }
      if (typeof process.env[key] === 'undefined') {
        process.env[key] = val;
      }
    });
  }
} catch (e) {
  // In dev, silently continue if .env cannot be loaded
}

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const DEV_ADMIN_SECRET = process.env.DEV_ADMIN_SECRET;
const DEBUG = process.env.DEBUG === 'true';
const DATA_DIR = path.join(__dirname, 'data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

// Validate required environment variables
if (NODE_ENV === 'production') {
  if (!JWT_SECRET || !ADMIN_PASSWORD_HASH) {
    console.error('ERROR: Missing required environment variables:');
    if (!JWT_SECRET) console.error('  - JWT_SECRET');
    if (!ADMIN_PASSWORD_HASH) console.error('  - ADMIN_PASSWORD_HASH');
    process.exit(1);
  }
}

// Security: Helmet for HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Security: CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim());
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 3600,
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Authorization']
}));

// Security: Request size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(cookieParser());

// Security: CSRF protection
const csrfProtection = csrf({ cookie: true });

// Security: Global rate limiting for DDOS protection
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute per IP
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => NODE_ENV === 'development' // Skip in development
});

// Security: Rate limiting for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Security: Rate limiting for analytics
const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many analytics events',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => NODE_ENV === 'development'
});

// Security: HTTPS enforcement in production
if (NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// Apply global rate limiter to all requests (DDOS protection)
app.use(globalLimiter);

app.use(express.static(path.join(__dirname, '../public')));
app.use('/vendor/fa', express.static(path.join(__dirname, '../node_modules/@fortawesome/fontawesome-free')));

// Public config endpoint for client-side feature flags (e.g., DEBUG)
app.get('/config', (req, res) => {
  res.json({ debug: DEBUG });
});

// Validation schemas
const analyticsEventSchema = Joi.object({
  event: Joi.string().valid('page_view', 'file_uploaded', 'analysis_complete').required(),
  sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
  timestamp: Joi.date().optional(),
  data: Joi.object().optional()
});

const adminLoginSchema = Joi.object({
  password: Joi.string().min(8).required()
});

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create data directory:', error);
  }
}

async function loadAnalytics() {
  try {
    const data = await fs.readFile(ANALYTICS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {
      events: [],
      summary: {
        totalEvents: 0,
        pageViews: 0,
        fileUploads: 0,
        analysisRuns: 0,
        lastUpdated: new Date().toISOString()
      }
    };
  }
}

async function saveAnalytics(data) {
  try {
    await fs.writeFile(ANALYTICS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save analytics:', error);
  }
}

function verifyAdminToken(req, res, next) {
  const token = req.cookies['admin-token'];
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      res.clearCookie('admin-token');
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// CSRF token endpoint
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Analytics endpoint: skip CSRF in development (client-side tracking, not sensitive)
// In production, consider adding rate limiting via IP
app.post('/api/analytics/event', analyticsLimiter, NODE_ENV === 'development' ? (req, res, next) => next() : csrfProtection, async (req, res) => {
  try {
    const { error, value } = analyticsEventSchema.validate(req.body, { stripUnknown: true });
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const analytics = await loadAnalytics();

    const eventRecord = {
      event: value.event,
      sessionId: value.sessionId,
      timestamp: value.timestamp ? new Date(value.timestamp).toISOString() : new Date().toISOString(),
      data: value.data || {},
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    analytics.events.push(eventRecord);
    analytics.summary.totalEvents++;

    if (value.event === 'page_view') {
      analytics.summary.pageViews++;
    } else if (value.event === 'file_uploaded') {
      analytics.summary.fileUploads++;
    } else if (value.event === 'analysis_complete') {
      analytics.summary.analysisRuns++;
    }

    analytics.summary.lastUpdated = new Date().toISOString();

    if (analytics.events.length > 10000) {
      analytics.events = analytics.events.slice(-10000);
    }

    await saveAnalytics(analytics);

    res.json({ success: true });
  } catch (error) {
    console.error('Analytics event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/login', loginLimiter, csrfProtection, async (req, res) => {
  try {
    const { error, value } = adminLoginSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const passwordMatch = await bcrypt.compare(value.password, ADMIN_PASSWORD_HASH);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { admin: true, iat: Math.floor(Date.now() / 1000) },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie('admin-token', token, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Dev-only admin login using a shared secret.
 * Safer than disabling auth: gated to NODE_ENV=development and requires matching secret.
 * Sets the same `admin-token` cookie as the normal login.
 */
app.post('/api/admin/dev-login', loginLimiter, async (req, res) => {
  try {
    if (NODE_ENV !== 'development') {
      return res.status(403).json({ error: 'Forbidden outside development' });
    }

    const provided = (req.body && req.body.secret) || req.headers['x-dev-admin-secret'];
    if (!DEV_ADMIN_SECRET || !provided || provided !== DEV_ADMIN_SECRET) {
      return res.status(401).json({ error: 'Invalid dev secret' });
    }

    const token = jwt.sign(
      { admin: true, iat: Math.floor(Date.now() / 1000) },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie('admin-token', token, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Dev login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/logout', csrfProtection, (req, res) => {
  res.clearCookie('admin-token');
  res.json({ success: true });
});

app.get('/api/admin/analytics', verifyAdminToken, async (req, res) => {
  try {
    const analytics = await loadAnalytics();
    
    const dailyStats = {};
    const eventTypes = {};
    const sessions = new Set();

    // Calculate summary from events if not present
    let totalEvents = analytics.events.length;
    let pageViews = 0;
    let fileUploads = 0;
    let analysisRuns = 0;

    analytics.events.forEach(event => {
      const date = event.timestamp.split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = { pageViews: 0, fileUploads: 0, analysisRuns: 0 };
      }

      eventTypes[event.event] = (eventTypes[event.event] || 0) + 1;
      sessions.add(event.sessionId);

      if (event.event === 'page_view') {
        dailyStats[date].pageViews++;
        pageViews++;
      }
      if (event.event === 'file_uploaded' || event.event === 'file_upload') {
        dailyStats[date].fileUploads++;
        fileUploads++;
      }
      if (event.event === 'analysis_complete') {
        dailyStats[date].analysisRuns++;
        analysisRuns++;
      }
    });

    const sortedDailyStats = Object.entries(dailyStats)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30)
      .reduce((acc, [date, stats]) => {
        acc[date] = stats;
        return acc;
      }, {});

    const summary = {
      totalEvents,
      pageViews,
      fileUploads,
      analysisRuns,
      lastUpdated: new Date().toISOString()
    };

    res.json({
      summary,
      events: analytics.events,
      uniqueSessions: sessions.size,
      eventTypes,
      dailyStats: sortedDailyStats,
      recentEvents: analytics.events.slice(-50).reverse()
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'CSRF token validation failed' });
  }
  
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
  await ensureDataDir();
  
  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Environment: ${NODE_ENV}`);
    console.log(`${'='.repeat(60)}\n`);
    
    if (NODE_ENV === 'development') {
      console.log('ℹ️  Development mode: HTTPS enforcement disabled');
    } else {
      console.log('✅ Production mode: HTTPS enforcement enabled');
    }
    
    console.log('📋 Required environment variables:');
    console.log('   - JWT_SECRET (for token signing)');
    console.log('   - ADMIN_PASSWORD_HASH (bcrypt hash)');
    console.log('   - ALLOWED_ORIGINS (comma-separated domains)');
    console.log('Optional:');
    console.log('   - DEBUG (true/false) to enable client debug logging');
    console.log('\n');
  });
}

startServer().catch(console.error);
