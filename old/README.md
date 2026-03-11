# SharePoint Link Analyzer - Getting Started

## 🎯 What is this project?

A complete, modular web application for analyzing SharePoint sharing links with focus on:
- **Privacy**: All analysis happens client-side
- **Security**: Identify anonymous links and security risks
- **Performance**: Async PowerShell script for fast scans
- **Insights**: Interactive tree-view and detailed statistics

## 📁 Project Structure

```
Sharepoint-link-analyser/
├── public/                      # Frontend (client-side)
│   ├── index.html              # Main page
│   ├── admin/                  # Admin dashboard
│   │   └── index.html
│   ├── css/                    # Styling
│   │   ├── variables.css       # CSS custom properties
│   │   ├── main.css            # Base styling
│   │   └── components.css      # Component-specific styling
│   └── js/                     # JavaScript modules
│       ├── app.js              # Main application
│       ├── components/         # Web Components
│       │   ├── script-builder.js
│       │   ├── app-guide.js
│       │   └── data-analyzer.js
│       ├── services/           # Business logic
│       │   ├── csv-parser.js
│       │   ├── data-processor.js
│       │   └── analytics.js
│       └── utils/              # Helper functions
│           └── helpers.js
├── api/                        # Backend (minimal)
│   └── server.js               # Express server for analytics
├── .github/                    # Example data
│   ├── copilot-instructions.md
│   └── reports/                # Example CSV files
├── GetAllSharingLinks.ps1      # PowerShell script (async, optimized)
├── package.json                # Node dependencies
├── README.md                   # Full documentation
├── PROJECT_REQUIREMENTS.md     # Technical specifications
└── .gitignore
```

## 🚀 Quick Start (5 minutes)

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm start
```

The application now runs on `http://localhost:3000`

**Note**: When starting, an admin password is configured. You'll need it to access the admin dashboard!

### 3. Use the Application

#### Option A: With Sample Data (Quick Test)

1. Go to `http://localhost:3000`
2. Click "Start Analysis"
3. Jump to Step 3
4. Upload a sample CSV from `.github/reports/`
5. View the analysis!

#### Option B: With Your Own SharePoint Data (Full Flow)

1. **Step 1**: Script Builder
   - Enter your tenant name
   - Configure filters (optional)
   - Copy the generated command

2. **Step 2**: Microsoft Entra ID Setup
   - Follow the guide to register an app
   - Add permissions
   - Download the script
   - Run it in PowerShell:
   ```powershell
   pwsh ./GetAllSharingLinks.ps1 -TenantName "your-tenant" -ClientId "<client-id>"
   ```

3. **Step 3**: Analysis
   - Upload the generated CSV/JSON file
   - View the detailed analysis!

## 🔐 Admin Dashboard

### Access

1. Navigate to `http://localhost:3000/admin`
2. Log in with the admin password (created during setup)
3. View real-time analytics

### What Gets Tracked?

- Page views per step
- Number of file uploads
- Number of analyses run
- Unique sessions
- Daily trends

**Privacy**: No user data, no file content, only aggregated statistics.

## 🛠️ Development

### Technical Details

**Frontend**:
- Vanilla JavaScript (ES6 modules)
- Native Web Components
- Modern CSS (Grid, Flexbox, Variables)
- Native Canvas API for charts

**Backend**:
- Express.js (minimal)
- File-based storage (JSON)
- CORS enabled for local development

### Key Features

1. **Script Builder** (`script-builder.js`)
   - Real-time command preview
   - Clipboard integration
   - Input validation

2. **Data Analyzer** (`data-analyzer.js`)
   - Client-side CSV/JSON parsing
   - Interactive tree-view
   - Native canvas charts
   - Export functionality

3. **PowerShell Script** (`GetAllSharingLinks.ps1`)
   - Asynchronous processing (PS7+)
   - Configurable throttle limit
   - Multiple authentication methods
   - Site exclusions via arguments

### Making Adjustments

**Customize styling**:
- Edit `public/css/variables.css` for colors/spacing
- Edit `public/css/components.css` for component styling

**Add new features**:
- Create a new Web Component in `public/js/components/`
- Import in `app.js`
- Use existing services for data processing

**Extend analytics**:
- Edit `api/server.js` for new endpoints
- Edit `public/js/services/analytics.js` for client tracking

## 📊 PowerShell Script Features

### Basic Usage

```powershell
# Interactive authentication (simplest)
pwsh ./GetAllSharingLinks.ps1 -TenantName "contoso" -ClientId "<app-id>"

# With site exclusions
pwsh ./GetAllSharingLinks.ps1 `
  -TenantName "contoso" `
  -ClientId "<app-id>" `
  -ExcludeSites @("https://contoso.sharepoint.com/sites/old")

# Only anonymous links that never expire
pwsh ./GetAllSharingLinks.ps1 `
  -TenantName "contoso" `
  -ClientId "<app-id>" `
  -GetAnyoneLinks `
  -NeverExpiresLinks

# With certificate authentication
pwsh ./GetAllSharingLinks.ps1 `
  -TenantName "contoso" `
  -ClientId "<app-id>" `
  -CertificateThumbprint "<thumbprint>"

# JSON output with higher parallelism
pwsh ./GetAllSharingLinks.ps1 `
  -TenantName "contoso" `
  -ClientId "<app-id>" `
  -OutputFormat Json `
  -ThrottleLimit 8
```

### Improvements over Original

✅ **Parallel processing**: Sites are processed asynchronously (PS7+)
✅ **No CSV for exclusions**: Exclude sites via command-line arguments
✅ **JSON support**: Output in CSV, JSON, or both
✅ **Better performance**: Configurable throttle limit
✅ **Better auth**: Flexible authentication options
✅ **Cleaner code**: Modular functions, better error handling

## 🎨 Design System

The project uses a consistent design system:

**Colors**:
- Primary: `#0078d4` (Microsoft Blue)
- Success: `#107c10`
- Warning: `#ff8c00`
- Danger: `#d13438`

**Spacing**:
- xs: 0.25rem
- sm: 0.5rem
- md: 1rem
- lg: 1.5rem
- xl: 2rem
- 2xl: 3rem

**Components**:
- Cards with consistent padding
- Buttons with hover states
- Form controls with focus states
- Badges and alerts
- Responsive grid layouts

## 🔍 Troubleshooting

### Script Errors

**"PnP module not found"**:
- The script installs it automatically, confirm with 'Y'
- Or: `Install-Module PnP.PowerShell -Scope CurrentUser`

**"Access denied"**:
- Check if app permissions are correct
- Verify that admin consent has been given

**"Sites not found"**:
- Check tenant name (without -admin, without .sharepoint.com)
- Use `Get-PnPTenantSite` to test

### Web Application

**Analytics not working**:
- Check if the server is running
- Check browser console for errors
- Verify CORS is enabled

**File upload fails**:
- Check file size (max 50MB)
- Verify CSV/JSON structure
- Check browser console for details

**Charts not displayed**:
- Check if data loaded correctly
- Verify Canvas support in browser
- Inspect element for errors

## 📚 Further Documentation

- **README.md**: Full project documentation
- **PROJECT_REQUIREMENTS.md**: Technical specifications and architecture
- **.github/copilot-instructions.md**: Code quality guidelines

## 🤝 Support

For questions or issues:
1. Check the troubleshooting section
2. Review sample data in `.github/reports/`
3. Check browser console for errors
4. Review PowerShell output for script issues

## 🎯 Next Steps

1. **Test the basic flow** with sample data
2. **Configure your Microsoft Entra ID app** according to the guide
3. **Run a scan** on your own tenant
4. **View the analytics** in the admin dashboard
5. **Customize as needed** (colors, filters, exports)

Good luck! 🚀
