# SharePoint Link Analyzer - Project Requirements

## Overview
Client-side web application voor het analyseren van SharePoint sharing links met focus op privacy, security en modulariteit.

## Key Principles
- **Privacy First**: Alle data-analyse gebeurt client-side, geen data wordt naar server gestuurd
- **Security**: Secure admin login, geen credentials opslag in frontend
- **Modular**: Web Components architectuur voor herbruikbaarheid
- **Native**: Minimale dependencies, gebruik native browser APIs waar mogelijk
- **Performance**: Efficiënte data processing voor grote CSV/JSON bestanden

## Architecture

### Technology Stack
- **Frontend**: Vanilla JavaScript (ES6+), Native Web Components
- **Styling**: Modern CSS (CSS Grid, Flexbox, CSS Variables)
- **Data Processing**: Native FileReader API, CSV/JSON parsing
- **Charts**: Native Canvas API of minimale chart library (Chart.js als enige exception)
- **Backend**: Minimal Node.js/Express voor analytics tracking only

### Data Structure (From CSV)
```csv
Site Name, Library, Object Type, File/Folder Name, File/Folder URL,
Link Type, Access Type, Roles, Users, File Type, Link Status,
Link Expiry Date, Days Since/To Expiry, Friendly Expiry Time,
Password Protected, Block Download, Shared Link, Site Url
```

## Features

### Step 1: Script Builder
- **Visual Argument Builder**
  - Tenant name input
  - Site URL selector (multi-select)
  - Exclude sites (multi-select with chips)
  - Filter options (switches/checkboxes):
    - Active Links / Expired Links
    - Links with Expiration / Never Expires
    - Soon to Expire (days input)
    - Anyone Links / Company Links / Specific People Links
  - Output format selector (CSV/JSON/Both)
  - Throttle limit slider (1-10)
- **Command Generator**
  - Real-time PowerShell command preview
  - One-click copy to clipboard
  - Syntax highlighting
  - Validation indicators

### Step 2: App Registration Guide
- **Step-by-step Tutorial**
  - Azure AD app registration
  - Required permissions (Sites.Read.All, Files.Read.All)
  - Certificate setup guide (optional)
  - Interactive checklist
- **Download Options**
  - Download PowerShell script button
  - Copy command button with toast confirmation
  - Requirements checker (PnP module, PowerShell version)

### Step 3: Data Analysis
- **File Upload**
  - Drag & drop zone
  - File type validation (CSV/JSON)
  - Size limit check
  - Progress indicator during parsing
  
- **Analytics Dashboard**
  - **Overview Cards**
    - Total sharing links
    - Active vs Expired
    - Anonymous links count
    - Never-expiring links count
  
  - **Top Statistics**
    - Top sharers (by user email)
    - Top recipients
    - Most shared sites
    - Most shared libraries
  
  - **Security Insights**
    - Anonymous links list with details
    - Never-expiring links
    - Password-protected links
    - Download-blocked links
  
  - **Visual Charts**
    - Link type distribution (pie chart)
    - Access type distribution (bar chart)
    - Expiry timeline (line chart)
    - Links per site (horizontal bar)
  
  - **Interactive Tree View**
    - Hierarchical structure: Site > Library > Folder > File
    - Expandable/collapsible nodes
    - Visual indicators for link types
    - Filter by link type, status
    - Search functionality
    - Click for detailed link info

- **Export Options**
  - Export filtered results
  - Generate PDF report
  - Copy statistics to clipboard

### Admin Dashboard
- **Authentication**
  - Secure login (JWT-based)
  - Session management
  - Rate limiting
  
- **Analytics Tracking**
  - Usage count (page views per step)
  - File uploads count
  - Analysis runs
  - Popular filters/options
  - Geographic data (optional)
  - Daily/weekly/monthly trends

- **Data Storage**
  - Minimal tracking (no user data)
  - Only aggregated statistics
  - GDPR compliant
  - Configurable retention period

### Informational Content
- **Privacy Notice**
  - Why client-side processing
  - No data retention policy
  - Security best practices
  
- **Performance Info**
  - Expected scan duration
  - System requirements
  - Tips for large tenants

## File Structure
```
/
├── index.html                 # Landing page
├── css/
│   ├── main.css              # Global styles
│   ├── variables.css         # CSS custom properties
│   └── components/           # Component-specific styles
├── js/
│   ├── app.js                # Main application logic
│   ├── router.js             # Client-side routing
│   ├── components/           # Web Components
│   │   ├── script-builder.js
│   │   ├── app-guide.js
│   │   ├── data-analyzer.js
│   │   ├── tree-view.js
│   │   └── chart-card.js
│   ├── services/
│   │   ├── csv-parser.js     # CSV parsing logic
│   │   ├── data-processor.js # Analysis logic
│   │   └── analytics.js      # Client-side tracking
│   └── utils/
│       ├── clipboard.js
│       └── validation.js
├── admin/
│   ├── index.html
│   └── dashboard.js
├── api/                       # Minimal backend
│   ├── server.js
│   └── analytics.js
├── assets/
│   └── icons/
├── GetAllSharingLinks.ps1    # PowerShell script
└── README.md
```

## Security Considerations
- CSP headers
- Input sanitization
- XSS prevention
- CSRF tokens for admin
- Secure cookie handling
- Rate limiting on API
- No sensitive data logging

## Performance Optimizations
- Virtual scrolling for large datasets
- Web Workers for heavy parsing
- Lazy loading of components
- Efficient tree rendering
- Debounced search/filter
- IndexedDB caching (optional)

## Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Development Phases
1. Core structure and routing
2. Step 1: Script Builder
3. Step 2: Guide implementation
4. Step 3: Analysis engine
5. Visualization and tree view
6. Admin dashboard
7. Polish and optimization
