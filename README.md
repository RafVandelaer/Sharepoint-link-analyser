# SharePoint Link Analyzer

Analyze SharePoint sharing links locally in the browser, using a PowerShell export from SharePoint Online.

## Live Version

The online version of the tool is available at:

- [sharepointer.be](https://sharepointer.be)

## What This Project Is

This repository combines two parts:

1. A PowerShell 7 export script that scans SharePoint Online and writes a CSV with sharing links.
2. A browser-based analyzer that loads that CSV locally and helps you review and remediate risky links.

No backend is required for the analyzer. The CSV is parsed in the browser.

## Main Capabilities

### Export script

The script in [web-assets/getallsharinglinks-full.ps1](web-assets/getallsharinglinks-full.ps1):

- signs in interactively with `PnP.PowerShell`
- scans SharePoint Online document libraries
- collects sharing links for files and folders
- can create and store the Entra app `ClientId` on first run
- supports interrupted-run recovery
- writes CSV, state, event log, cleanup queue, and summary output

### Analyzer

The analyzer in [index.html](index.html):

- uploads and validates the CSV
- shows summary metrics and charts
- provides a tree view based on `ItemPath`
- shows detail for the selected node
- supports row-level review in the raw table
- highlights urgent links using a risk heuristic
- generates remediation PowerShell for critical or selected links

## Privacy Model

The analyzer runs client-side in the browser.

- The CSV is not uploaded by this project to a backend.
- SharePoint content is read only by the PowerShell script you run yourself.
- The script writes all outputs to your local output folder.

## Repository Structure

```text
.
├── index.html
├── README.md
├── web-assets/
│   ├── favicon.svg
│   └── getallsharinglinks-full.ps1
└── old/
    └── earlier prototype files
```

## Quick Start

### 1. Install prerequisites

- PowerShell 7
- `PnP.PowerShell`
- access to SharePoint Online

Install the PowerShell module if needed:

```powershell
Install-Module PnP.PowerShell -Scope CurrentUser
```

### 2. Run the export script

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

Use one of these:

- open [index.html](index.html) locally
- use the hosted version at [sharepointer.be](https://sharepointer.be)

### 4. Upload the CSV

Typical export file name:

```text
SharingLinks-<tenant>-<timestamp>.csv
```

## End-to-End Workflow

1. Run the PowerShell script against your tenant.
2. Wait for the export to complete.
3. Open the analyzer and upload the CSV.
4. Use summary cards and charts to understand the overall sharing landscape.
5. Use `Urgent Review` to inspect the most suspicious links first.
6. Use `Tree View`, `Detail`, and `Raw Rows` to validate context.
7. Select links you want to remediate.
8. Generate and copy a PowerShell remediation script.
9. Review the script carefully before executing it.

## PowerShell Script

### Script location

[web-assets/getallsharinglinks-full.ps1](web-assets/getallsharinglinks-full.ps1)

### What it does

At a high level, the script:

1. Loads `PnP.PowerShell`
2. Resolves or creates a tenant `ClientId`
3. Creates tenant-specific output paths
4. Recovers from interrupted previous runs if needed
5. Connects to the SharePoint admin site
6. Enumerates sites and document libraries
7. Reads sharing links from files and folders
8. Temporarily grants Site Collection Admin when required
9. Logs progress and writes outputs
10. Removes temporary admin access during cleanup

### First run vs later runs

On the first run, pass `-OnMicrosoftDomain` so the script can create and store the Entra app `ClientId`.

After that, the stored `ClientId` is reused automatically when available.

You can still pass `-ClientId` explicitly if needed, for example on another machine.

### Main parameters

- `-TenantName`: tenant prefix, for example `contoso`
- `-OnMicrosoftDomain`: required on first run if no stored `ClientId` exists
- `-ClientId`: optional explicit app id
- `-OutputDirectory`: base output folder
- `-SiteUrl`: scan a single site
- `-IncludeOneDrive`: include personal OneDrive sites
- `-RecoveryOnly`: only perform recovery/cleanup
- `-MaxSites`: limit number of sites
- `-MaxLibrariesPerSite`: limit number of libraries per site
- `-MaxItemsPerLibrary`: limit number of items per library
- `-ApplicationName`: custom Entra app base name

### Example commands

Single site:

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

### Output files

The script writes tenant-specific files inside your chosen output directory:

- `SharingLinks-<tenant>-<timestamp>.csv`
- `SharingLinks-<tenant>-RunState.json`
- `SharingLinks-<tenant>-Events.log`
- `SharingLinks-<tenant>-CleanupQueue.csv`
- `SharingLinks-<tenant>-Summary-<timestamp>.txt`
- `SharingLinks-<tenant>.lock`

### CSV columns

The CSV includes fields such as:

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

## Analyzer Features

[index.html](index.html) is the main analyzer page.

Core features:

- drag-and-drop CSV upload
- local parsing and validation
- summary cards
- charts by item type, expiration status, and top sites
- tree-based navigation
- detail pane for the current node
- raw rows table
- search and expiration filters
- urgent review
- remediation script generation
- bundled PowerShell download button

## Risk Review and Remediation

The remediation workflow is designed around three steps:

1. `Urgent Review`
   Surfaces links that deserve attention first.

2. `Selection`
   Lets you choose links from the urgent list or raw rows.

3. `Remediation`
   Generates PowerShell commands you can review and run yourself.

The page does not delete links directly. It only prepares a script.

### Current risk signals

The urgency score currently considers signals such as:

- no expiration
- anonymous scope
- organization-wide scope
- folder-level sharing
- edit or review permissions
- many recipients
- unique permissions
- folders with many exposed items underneath them

This is a heuristic, not a compliance decision engine.

## Running Locally

Simplest option:

- open `index.html` directly in a browser

Optional local static hosting:

```bash
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080/index.html`

## Troubleshooting

### `PnP.PowerShell is not installed`

Install it:

```powershell
Install-Module PnP.PowerShell -Scope CurrentUser
```

### `No stored ClientId was found`

Run once with `-OnMicrosoftDomain`:

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

### The CSV does not load

Check:

- the file is a CSV export from this script
- the header row is intact
- the file is not empty
- required columns are present
- `ItemPath` values are not damaged by manual editing

### The script finds no sites

Check:

- the tenant name is correct
- you signed into the intended tenant
- OneDrive filtering is not excluding expected content
- your account has sufficient access

## Notes

- `old/` contains earlier prototype files and is not the current app
- `index.html` is the analyzer entrypoint
- `web-assets/getallsharinglinks-full.ps1` is the current export script

## License

Add your preferred license here.
