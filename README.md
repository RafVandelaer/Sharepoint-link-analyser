# SharePoint Link Analyzer

Client-side SharePoint sharing link analyzer with a PowerShell export script.

This repository contains:

- A static web page that analyzes a CSV export fully in the browser
- A PowerShell 7 script that scans SharePoint Online for sharing links
- No backend, database, or server-side data processing

## What It Does

The PowerShell script in [web-assets/getallsharinglinks-full.ps1](web-assets/getallsharinglinks-full.ps1) connects to SharePoint Online, scans document libraries, collects sharing links for files and folders, and exports the results to CSV.

The web analyzer in [index.html](index.html) lets you upload that CSV and inspect it locally with:

- Summary metrics
- Expiration and item-type charts
- Top sites overview
- Tree view based on `ItemPath`
- Detail pane per node
- Search and status filters

## Privacy Model

The analyzer runs entirely in the browser. Your CSV is not uploaded to a server by this project.

The PowerShell script reads SharePoint data from your tenant and writes output files locally to the folder you choose.

## Repository Structure

```text
.
├── index.html
├── web-assets/
│   ├── favicon.svg
│   └── getallsharinglinks-full.ps1
└── old/
    └── previous prototype and archived files
```

## Requirements

### For the web analyzer

- A modern browser
- The generated CSV from the PowerShell script

You can open `index.html` directly in a browser, or host it as a static file on GitHub Pages, SharePoint, a web server, or local static hosting.

### For the PowerShell script

- PowerShell 7
- `PnP.PowerShell`
- Access to SharePoint Online
- Permission to sign in interactively
- Enough rights to create the Entra app on first run, or an existing stored `ClientId`

If `PnP.PowerShell` is missing, install it with:

```powershell
Install-Module PnP.PowerShell -Scope CurrentUser
```

## Quick Start

### 1. Download or clone the repository

```bash
git clone <your-repo-url>
cd Sharepoint-link-analyser
```

### 2. Run the PowerShell export script

First run for a tenant:

```powershell
pwsh .\web-assets\getallsharinglinks-full.ps1 `
  -TenantName yourtenant `
  -OnMicrosoftDomain yourtenant `
  -OutputDirectory .\output
```

Normal scan after the first setup:

```powershell
pwsh .\web-assets\getallsharinglinks-full.ps1 `
  -TenantName yourtenant `
  -OutputDirectory .\output
```

### 3. Open the analyzer

Open `index.html` in your browser.

### 4. Upload the generated CSV

Upload the file created by the script, typically named like:

```text
SharingLinks-<tenant>-<timestamp>.csv
```

## PowerShell Script

### Script Location

[web-assets/getallsharinglinks-full.ps1](web-assets/getallsharinglinks-full.ps1)

### How the Script Works

At a high level, the script:

1. Loads `PnP.PowerShell`
2. Resolves or creates a `ClientId` for the tenant
3. Creates a tenant-specific output folder structure
4. Restores cleanup for an interrupted previous run if needed
5. Connects to the SharePoint admin site
6. Enumerates sites and document libraries
7. Scans files and folders for sharing links
8. Temporarily grants Site Collection Admin where required
9. Writes CSV, state, summary, event log, and cleanup data
10. Removes temporary access again during cleanup

### First Run vs Later Runs

On the first run, the script can create the required Entra app registration automatically when you pass `-OnMicrosoftDomain`.

After that, the tenant's `ClientId` is stored and reused automatically when available. You can still provide `-ClientId` explicitly if you want to run from another machine or bypass stored configuration.

### Main Parameters

- `-TenantName`: SharePoint tenant prefix, for example `contoso`
- `-OnMicrosoftDomain`: required on first run when no stored `ClientId` exists yet
- `-ClientId`: optional explicit app id
- `-OutputDirectory`: base output folder
- `-SiteUrl`: scan a single site only
- `-IncludeOneDrive`: include personal OneDrive sites
- `-RecoveryOnly`: run cleanup/recovery without starting a new scan
- `-MaxSites`: limit number of sites
- `-MaxLibrariesPerSite`: limit number of libraries per site
- `-MaxItemsPerLibrary`: limit number of items per library
- `-ApplicationName`: custom app registration name base

### Example Commands

Scan a single site:

```powershell
pwsh .\web-assets\getallsharinglinks-full.ps1 `
  -TenantName contoso `
  -SiteUrl https://contoso.sharepoint.com/sites/project `
  -OutputDirectory .\output
```

Include OneDrive:

```powershell
pwsh .\web-assets\getallsharinglinks-full.ps1 `
  -TenantName contoso `
  -IncludeOneDrive `
  -OutputDirectory .\output
```

Small test run:

```powershell
pwsh .\web-assets\getallsharinglinks-full.ps1 `
  -TenantName contoso `
  -MaxSites 5 `
  -MaxLibrariesPerSite 5 `
  -MaxItemsPerLibrary 500 `
  -OutputDirectory .\output
```

Recovery only:

```powershell
pwsh .\web-assets\getallsharinglinks-full.ps1 `
  -TenantName contoso `
  -RecoveryOnly `
  -OutputDirectory .\output
```

### Output Files

For each tenant, the script writes files to a tenant-specific folder inside your chosen output directory:

- `SharingLinks-<tenant>-<timestamp>.csv`: main export for the analyzer
- `SharingLinks-<tenant>-RunState.json`: run state and recovery data
- `SharingLinks-<tenant>-Events.log`: event log
- `SharingLinks-<tenant>-CleanupQueue.csv`: cleanup tracking
- `SharingLinks-<tenant>-Summary-<timestamp>.txt`: summary report
- `SharingLinks-<tenant>.lock`: lock file while a run is active

### CSV Columns

The exported CSV includes these main fields:

- `RunId`
- `ExportedAt`
- `SiteTitle`
- `SiteUrl`
- `LibraryTitle`
- `ItemId`
- `ItemName`
- `ItemPath`
- `ItemType`
- `HasUniqueRoleAssignments`
- `LinkId`
- `LinkKind`
- `LinkType`
- `Scope`
- `LinkUrl`
- `Created`
- `Expiration`
- `PreventsDownload`
- `BlocksDownload`
- `HasPassword`
- `CreatedBy`
- `GrantedTo`

## Web Analyzer

### Features

The analyzer in `index.html` supports:

- Drag and drop CSV upload
- Embedded fictional sample CSV
- Local parsing and validation
- Summary cards for rows, links, items, sites, and expiration
- Charts by item type, expiration status, and top sites
- Tree navigation grouped by item path
- Detail panel for the selected node
- Search across site, item, and path
- Status filter including expired-only view
- Script download button for the PowerShell file

### Required CSV Columns

The page validates uploaded CSV files and expects the columns generated by the bundled script. At minimum, the structure should match the export generated by `getallsharinglinks-full.ps1`.

### Running Locally

Simplest option:

- Double-click `index.html`

Optional static hosting:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Typical Workflow

1. Run the PowerShell script against your tenant
2. Wait for the scan to complete
3. Locate the generated CSV in your output folder
4. Open `index.html`
5. Upload the CSV
6. Review summary metrics, charts, and the tree view
7. Filter for expired or risky links
8. Drill into the detail panel for specific items or folders

## Troubleshooting

### `PnP.PowerShell is not installed`

Install the module:

```powershell
Install-Module PnP.PowerShell -Scope CurrentUser
```

### `No stored ClientId was found`

Run the script once with `-OnMicrosoftDomain`, for example:

```powershell
pwsh .\web-assets\getallsharinglinks-full.ps1 `
  -TenantName contoso `
  -OnMicrosoftDomain contoso `
  -OutputDirectory .\output
```

### A previous run was interrupted

Run:

```powershell
pwsh .\web-assets\getallsharinglinks-full.ps1 `
  -TenantName contoso `
  -RecoveryOnly `
  -OutputDirectory .\output
```

### The script finds no sites

Check:

- The tenant name is correct
- You are signing into the intended tenant
- OneDrive filtering is not excluding what you expected to scan
- Your account has the required access

### The CSV does not load in the analyzer

Check:

- The file is a CSV export from this script
- The header row is intact
- The file is not empty
- Required columns are present

## Notes

- The `old/` folder contains earlier prototype files and is not the current app
- The current analyzer is a single-file static frontend in `index.html`
- The current export script is `web-assets/getallsharinglinks-full.ps1`

## License

Add your preferred license here.
