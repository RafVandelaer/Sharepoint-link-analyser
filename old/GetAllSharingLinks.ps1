<#!
.SYNOPSIS
  Export all sharing links in SharePoint Online with optional filtering.
.DESCRIPTION
  Enumerates document libraries across SharePoint sites, collects sharing links, filters by status/type, and writes a CSV report. Supports parallel site processing on PowerShell 7+, interactive or app-based auth, and site exclusions via arguments (no CSV required).
.PARAMETER TenantName
  Tenant short name (e.g., contoso) used to build the admin URL.
.PARAMETER SiteUrls
  Optional list of site URLs to scan. If omitted, the script enumerates all tenant sites.
.PARAMETER ExcludeSites
  Optional list of site URLs to skip.
.PARAMETER ClientId
  Azure AD app ID for PnP auth (used for interactive or certificate auth).
.PARAMETER CertificateThumbprint
  Certificate thumbprint for certificate-based auth.
.PARAMETER AdminName
  UPN for username/password auth (not recommended).
.PARAMETER Password
  Password paired with AdminName.
.PARAMETER ActiveLinks
  Only include active links.
.PARAMETER ExpiredLinks
  Only include expired links.
.PARAMETER LinksWithExpiration
  Only include links that have an expiration date.
.PARAMETER NeverExpiresLinks
  Only include links without expiration.
.PARAMETER SoonToExpireInDays
  Only include links expiring within the specified number of days.
.PARAMETER GetAnyoneLinks
  Only include Anyone/Anonymous links.
.PARAMETER GetCompanyLinks
  Only include Organization-wide links.
.PARAMETER GetSpecificPeopleLinks
  Only include links shared with specific people.
.PARAMETER ThrottleLimit
  Parallelism level for site processing (PowerShell 7+).
.PARAMETER OutputPath
  Optional output path (without extension or with .csv/.json). Defaults to a timestamped file in the script directory.
.PARAMETER OutputFormat
  Choose Csv, Json, of Both.
.NOTES
  Requires PnP.PowerShell 1.12.0+. Parallel mode needs PowerShell 7+.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$TenantName,

    [Alias('IncludeSites')]
    [string[]]$SiteUrls,
    [string[]]$ExcludeSites = @(),

    [string]$ClientId,
    [string]$CertificateThumbprint,
    [string]$AdminName,
    [string]$Password,

    [switch]$ActiveLinks,
    [switch]$ExpiredLinks,
    [switch]$LinksWithExpiration,
    [switch]$NeverExpiresLinks,
    [int]$SoonToExpireInDays = -1,
    [switch]$GetAnyoneLinks,
    [switch]$GetCompanyLinks,
    [switch]$GetSpecificPeopleLinks,

    [switch]$StreamOutput,

    [int]$ThrottleLimit = 4,
  [string]$OutputPath,

  [ValidateSet("Csv","Json","Both")]
  [string]$OutputFormat = "Csv"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Ensure-PnPModule {
    <#!
    .SYNOPSIS
      Makes sure PnP.PowerShell is installed and loaded.
    #>
    $module = Get-InstalledModule -Name PnP.PowerShell -MinimumVersion 1.12.0 -ErrorAction SilentlyContinue
    if (-not $module) {
        Write-Host "PnP.PowerShell module not found. Installing for current user..." -ForegroundColor Yellow
        Install-Module -Name PnP.PowerShell -Scope CurrentUser -Force -AllowClobber
    }
    Import-Module -Name PnP.PowerShell -MinimumVersion 1.12.0 -ErrorAction Stop
}

function New-ConnectionInfo {
    <#!
    .SYNOPSIS
      Builds the authentication context used per site connection.
    .PARAMETER TenantName
      Tenant short name.
    .PARAMETER ClientId
      App registration client ID (optional for interactive).
    .PARAMETER CertificateThumbprint
      Certificate thumbprint for app-only auth.
    .PARAMETER AdminName
      UPN for username/password auth.
    .PARAMETER Password
      Password paired with AdminName.
    .OUTPUTS
      Hashtable with connection settings.
    #>
    param(
        [string]$TenantName,
        [string]$ClientId,
        [string]$CertificateThumbprint,
        [string]$AdminName,
        [string]$Password
    )

    $credential = $null
    if ($AdminName -and $Password) {
        $securePwd = ConvertTo-SecureString -String $Password -AsPlainText -Force
        $credential = [pscredential]::new($AdminName, $securePwd)
    }

    return @{
        TenantName = $TenantName
        ClientId = $ClientId
        Thumbprint = $CertificateThumbprint
        Credential = $credential
    }
}

function Get-TargetSiteUrls {
    <#!
    .SYNOPSIS
      Determines which sites to scan based on provided URLs or tenant discovery.
    .PARAMETER TenantName
      Tenant short name.
    .PARAMETER ProvidedSites
      Optional list of site URLs.
    .PARAMETER Excluded
      HashSet of URLs to skip.
    .PARAMETER ConnectionInfo
      Auth context used for tenant connection when discovering sites.
    .OUTPUTS
      Array of site URLs to process.
    #>
    param(
        [string]$TenantName,
        [string[]]$ProvidedSites,
        [System.Collections.Generic.HashSet[string]]$Excluded,
        [hashtable]$ConnectionInfo
    )

    if ($ProvidedSites -and $ProvidedSites.Count -gt 0) {
        return $ProvidedSites | Where-Object { -not $Excluded.Contains($_.TrimEnd('/')) }
    }

    $adminUrl = "https://$TenantName-admin.sharepoint.com"
    Connect-PnPOnline -Url $adminUrl -Interactive -ClientId $ConnectionInfo.ClientId -ErrorAction Stop
    $tenantSites = Get-PnPTenantSite -IncludeOneDriveSites:$true -ErrorAction Stop
    Disconnect-PnPOnline -WarningAction SilentlyContinue

    $ignoredTemplates = @("SRCHCEN#0", "REDIRECTSITE#0", "SPSMSITEHOST#0", "APPCATALOG#0", "POINTPUBLISHINGHUB#0", "EDISC#0", "STS#-1")

    return $tenantSites |
      Where-Object { $ignoredTemplates -notcontains $_.Template } |
      ForEach-Object { $_.Url.TrimEnd('/') } |
      Where-Object { -not $Excluded.Contains($_) }
}

function New-ReportPaths {
    <#!
    .SYNOPSIS
      Resolves CSV/JSON output paths, creating directories when needed.
    .PARAMETER OutputPath
      Optional path from user (file or directory).
    .PARAMETER OutputFormat
      Csv, Json, or Both.
    .OUTPUTS
      Hashtable with Csv and Json entries (may be null if not requested).
    #>
    param(
        [string]$OutputPath,
        [string]$OutputFormat
    )

    $timeStamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $baseName = "SPO_SharingLinks_$timeStamp"

    if ([string]::IsNullOrWhiteSpace($OutputPath)) {
        $base = Join-Path -Path $PSScriptRoot -ChildPath $baseName
    } elseif ((Test-Path -LiteralPath $OutputPath) -and (Get-Item -LiteralPath $OutputPath).PSIsContainer) {
        $base = Join-Path -Path $OutputPath -ChildPath $baseName
    } else {
        $directory = Split-Path -Parent $OutputPath
        $leaf = Split-Path -Leaf $OutputPath
        $nameWithoutExt = [System.IO.Path]::GetFileNameWithoutExtension($leaf)
        $effectiveName = if ([string]::IsNullOrWhiteSpace($nameWithoutExt)) { $baseName } else { $nameWithoutExt }

        if (-not [string]::IsNullOrWhiteSpace($directory) -and -not (Test-Path -LiteralPath $directory)) {
            New-Item -Path $directory -ItemType Directory -Force | Out-Null
        }

        $base = if ([string]::IsNullOrWhiteSpace($directory)) { $effectiveName } else { Join-Path -Path $directory -ChildPath $effectiveName }
    }

    return @{
        Csv  = if ($OutputFormat -in @("Csv","Both")) { "$base.csv" } else { $null }
        Json = if ($OutputFormat -in @("Json","Both")) { "$base.json" } else { $null }
    }
}

Ensure-PnPModule

$connectionInfo = New-ConnectionInfo -TenantName $TenantName -ClientId $ClientId -CertificateThumbprint $CertificateThumbprint -AdminName $AdminName -Password $Password
$excludeLookup = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$ExcludeSites | Where-Object { $_ } | ForEach-Object { [void]$excludeLookup.Add($_.TrimEnd('/')) }

$enableProgress = $true

$targetSites = @(Get-TargetSiteUrls -TenantName $TenantName -ProvidedSites $SiteUrls -Excluded $excludeLookup -ConnectionInfo $connectionInfo)
if (-not $targetSites -or $targetSites.Count -eq 0) {
  Write-Warning "No sites to process after applying exclusions."
    return
}

$reportPaths = New-ReportPaths -OutputPath $OutputPath -OutputFormat $OutputFormat
$filters = @{
    ActiveLinks = [bool]$ActiveLinks
    ExpiredLinks = [bool]$ExpiredLinks
    LinksWithExpiration = [bool]$LinksWithExpiration
    NeverExpiresLinks = [bool]$NeverExpiresLinks
    SoonToExpireInDays = $SoonToExpireInDays
    GetAnyoneLinks = [bool]$GetAnyoneLinks
    GetCompanyLinks = [bool]$GetCompanyLinks
    GetSpecificPeopleLinks = [bool]$GetSpecificPeopleLinks
}

$excludedLists = @(
    "Form Templates", "Style Library", "Site Assets", "Site Pages", "Preservation Hold Library",
    "Pages", "Images", "Site Collection Documents", "Site Collection Images"
)

$processSiteBlock = {
    param(
        [string]$SiteUrl,
        [hashtable]$ConnectionInfo,
        [hashtable]$Filters,
    [string[]]$ExcludedLists,
    [hashtable]$ReportPaths,
    [bool]$StreamOutput,
    [bool]$EnableProgress
    )

    Import-Module PnP.PowerShell -MinimumVersion 1.12.0 -ErrorAction Stop

    function Connect-SharePointSite {
      param([string]$Url)

      if (-not $ConnectionInfo.ClientId) {
        throw "ClientId is required. Provide -ClientId (app registration ID)."
      }

      if ($ConnectionInfo.Credential) {
        Connect-PnPOnline -Url $Url -ClientId $ConnectionInfo.ClientId -Credential $ConnectionInfo.Credential -ErrorAction Stop
        return
      }

      if ($ConnectionInfo.Thumbprint -and -not [string]::IsNullOrWhiteSpace($ConnectionInfo.Thumbprint)) {
        $tenant = "$($ConnectionInfo.TenantName).onmicrosoft.com"
        try {
          Connect-PnPOnline -Url $Url -ClientId $ConnectionInfo.ClientId -Thumbprint $ConnectionInfo.Thumbprint -Tenant $tenant -ErrorAction Stop
          return
        } catch {
          Write-Warning "Certificate with thumbprint '$($ConnectionInfo.Thumbprint)' not found or unusable. Falling back to interactive login. Error: $($_.Exception.Message)"
          # Fall through to interactive
        }
      }

      Connect-PnPOnline -Url $Url -Interactive -ClientId $ConnectionInfo.ClientId -ErrorAction Stop
    }

    function Should-IncludeLink {
        param(
            [string]$Scope,
            [string]$LinkStatus,
            [nullable[datetime]]$ExpirationDate,
            [int]$ExpiryDays
        )

        if ($Filters.GetAnyoneLinks -and $Scope -ne "Anonymous") { return $false }
        if ($Filters.GetCompanyLinks -and $Scope -ne "Organization") { return $false }
        if ($Filters.GetSpecificPeopleLinks -and $Scope -ne "Users") { return $false }

        if ($Filters.ActiveLinks -and $LinkStatus -ne "Active") { return $false }
        if ($Filters.ExpiredLinks -and $LinkStatus -ne "Expired") { return $false }
        if ($Filters.LinksWithExpiration -and -not $ExpirationDate) { return $false }
        if ($Filters.NeverExpiresLinks -and $LinkStatus -ne "Active" -and $ExpirationDate) { return $false }
        if ($Filters.NeverExpiresLinks -and $ExpirationDate) { return $false }

        if (($Filters.SoonToExpireInDays -ge 0) -and (($ExpiryDays -lt 0) -or ($ExpiryDays -gt $Filters.SoonToExpireInDays))) {
            return $false
        }

        return $true
    }

    function Get-SharingLinksFromSite {
        param([string]$SiteUrl)

        if ($EnableProgress) {
          Write-Host "[Site] $SiteUrl - connecting..." -ForegroundColor Cyan
        }

        try {
            Connect-SharePointSite -Url $SiteUrl
        } catch {
          Write-Warning "Could not connect to ${SiteUrl}: $($_.Exception.Message)"
          return @()
        }

        $siteTitle = $null
        try {
          $web = Get-PnPWeb -ErrorAction Stop
          $siteTitle = $web.Title
          if ($EnableProgress) { Write-Host "[Site] $siteTitle" -ForegroundColor Green }
        } catch {
          Write-Warning "Insufficient access to ${SiteUrl}. Make yourself a Site Collection Administrator or use an app-only connection with Sites.Selected/Sites.FullControl.All. Site is skipped. Error: $($_.Exception.Message)"
          Disconnect-PnPOnline -WarningAction SilentlyContinue
          return @()
        }
        $libraries = Get-PnPList -Includes Title, Hidden, BaseType, Id -ErrorAction Stop |
            Where-Object { -not $_.Hidden -and $_.BaseType -eq "DocumentLibrary" -and $_.Title -notin $ExcludedLists }

        $results = @()
        $siteLinkCount = 0
        foreach ($list in $libraries) {
          if ($EnableProgress) { Write-Host "  [Lib] $($list.Title) - fetching items..." -ForegroundColor Yellow }
            $items = Get-PnPListItem -List $list -PageSize 2000 -ErrorAction Stop
            $itemCount = ($items | Measure-Object).Count
            if ($EnableProgress) { Write-Host "  [Lib] $($list.Title) - $itemCount items fetched" -ForegroundColor Yellow }

            $libLinkCount = 0
            $missingFieldCount = 0

            $processedCount = 0
            foreach ($item in $items) {
              $processedCount++
              if ($EnableProgress -and $processedCount % 100 -eq 0) {
                Write-Host "    [Progress] $processedCount/$itemCount items checked..." -ForegroundColor DarkCyan
              }

              # Load required properties with multiple fallbacks to avoid skipping items
              $fv = $item.FieldValues
              $objectType = $null
              $fileUrl = $null
              $fileLeaf = $null

              if ($fv.ContainsKey("FileSystemObjectType")) { $objectType = $fv.FileSystemObjectType }
              if (-not $objectType) { $objectType = $item.FileSystemObjectType }
              if (-not $objectType -and $fv.ContainsKey("FSObjType")) { $objectType = $fv.FSObjType }
              if (-not $objectType) { $objectType = Get-PnPProperty -ClientObject $item -Property FileSystemObjectType -ErrorAction SilentlyContinue }

              if ($fv.ContainsKey("FileRef")) { $fileUrl = $fv.FileRef }
              if (-not $fileUrl -and $item["FileRef"]) { $fileUrl = $item["FileRef"] }
              if (-not $fileUrl) { $fileUrl = Get-PnPProperty -ClientObject $item -Property FileRef -ErrorAction SilentlyContinue }

              if ($fv.ContainsKey("FileLeafRef")) { $fileLeaf = $fv.FileLeafRef }
              if (-not $fileLeaf -and $item["FileLeafRef"]) { $fileLeaf = $item["FileLeafRef"] }
              if (-not $fileLeaf) { $fileLeaf = Get-PnPProperty -ClientObject $item -Property FileLeafRef -ErrorAction SilentlyContinue }

              if (-not $objectType -or -not $fileUrl) {
                $missingFieldCount++
                continue
              }

              $hasUnique = (Get-PnPProperty -ClientObject $item -Property HasUniqueRoleAssignments -ErrorAction Stop)
              if (-not $hasUnique) { continue }

              $itemId = $item.Id
              $listId = $list.Id.ToString()
              $tenantHost = "https://$($ConnectionInfo.TenantName).sharepoint.com"
              $siteUrl = $SiteUrl
              $urlEncodedPath = $fileUrl -replace ' ', '%20' -replace '\[', '%5B' -replace '\]', '%5D'
              $manageClassic = "$siteUrl/$urlEncodedPath"
              $manageModern = "$siteUrl/$urlEncodedPath"

              $sharingLinks = @()
              try {
                if ($objectType -eq 0) {
                  $sharingLinks = Get-PnPFileSharingLink -Identity $fileUrl -ErrorAction Stop
                } elseif ($objectType -eq 1) {
                  $sharingLinks = Get-PnPFolderSharingLink -Folder $fileUrl -ErrorAction Stop
                }
              } catch {
                # Don't warn on every item - most items won't have sharing links
                # Only problematic errors will appear
              }

              if (-not $sharingLinks) { continue }

                foreach ($sharingLink in $sharingLinks) {
                    $linkInfo = $sharingLink.Link
                    $scope = $linkInfo.Scope
                    $permission = $linkInfo.Type
                    $sharedLink = $linkInfo.WebUrl
                    $passwordProtected = $sharingLink.HasPassword
                    $blockDownload = $linkInfo.PreventsDownload
                    $roleList = ($sharingLink.Roles -join ",")
                    $expirationDate = $sharingLink.ExpirationDateTime

                    # Safely extract recipient emails (works for file/folder links with varying shapes)
                    $recipients = @()
                    if ($sharingLink.GrantedToIdentitiesV2) {
                      foreach ($grantee in $sharingLink.GrantedToIdentitiesV2) {
                        if ($grantee -and $grantee.User -and $grantee.User.Email) {
                          $recipients += $grantee.User.Email
                        } elseif ($grantee -and $grantee.Email) {
                          $recipients += $grantee.Email
                        }
                      }
                    }
                    $directUsers = ($recipients | Where-Object { $_ } | Select-Object -Unique) -join ","

                    $currentDate = (Get-Date).Date
                    if ($expirationDate) {
                        $expiryDateLocal = ([datetime]$expirationDate).ToLocalTime()
                        $expiryDays = (New-TimeSpan -Start $currentDate -End $expiryDateLocal).Days
                        if ($expiryDateLocal -lt $currentDate) {
                            $linkStatus = "Expired"
                            $friendlyExpiry = "Expired $([math]::Abs($expiryDays)) days ago"
                        } else {
                            $linkStatus = "Active"
                            $friendlyExpiry = "Expires in $expiryDays days"
                        }
                    } else {
                        $linkStatus = "Active"
                        $expiryDays = -1
                        $expirationDate = $null
                        $friendlyExpiry = "Never Expires"
                    }

                    if (-not (Should-IncludeLink -Scope $scope -LinkStatus $linkStatus -ExpirationDate $expirationDate -ExpiryDays $expiryDays)) {
                        continue
                    }

                    $result = [pscustomobject]@{
                      "Site Name"              = $siteTitle
                      "Library"                = $list.Title
                      "Object Type"            = if ($objectType -eq 0) { "File" } else { "Folder" }
                      "File/Folder Name"       = $fileLeaf
                      "File/Folder URL"        = $fileUrl
                      "Link Type"              = $scope
                      "Access Type"            = $permission
                      "Roles"                  = $roleList
                      "Users"                  = $directUsers
                      "File Type"              = $item.FieldValues.File_x0020_Type
                      "Link Status"            = $linkStatus
                      "Link Expiry Date"       = $expirationDate
                      "Days Since/To Expiry"   = $expiryDays
                      "Friendly Expiry Time"   = $friendlyExpiry
                      "Password Protected"     = $passwordProtected
                      "Block Download"         = $blockDownload
                      "Shared Link"            = $sharedLink
                      "Site Url"               = $SiteUrl
                      "List Id"                = $listId
                      "Item Id"                = $itemId
                      "Manage Access Url"      = $manageClassic
                      "Manage Access Url Modern" = $manageModern
                    }

                    $results += $result
          $siteLinkCount++
          $libLinkCount++
                }
            }

                if ($EnableProgress) { Write-Host "  [Lib done] $($list.Title) - $libLinkCount links from $itemCount items" -ForegroundColor Yellow }
                if ($missingFieldCount -gt 0 -and $EnableProgress) {
                  Write-Host "  [Lib note] Skipped $missingFieldCount items missing FileRef/FileSystemObjectType in $($list.Title)" -ForegroundColor DarkYellow
                }
        }

              if ($StreamOutput -and $ReportPaths.Csv -and $results.Count -gt 0) {
                $results | Export-Csv -Path $ReportPaths.Csv -NoTypeInformation -Force -Append
              }

              Disconnect-PnPOnline -WarningAction SilentlyContinue
            if ($EnableProgress) { Write-Host "[Site done] $siteTitle - $siteLinkCount links" -ForegroundColor Green }
              if ($StreamOutput -and $ReportPaths.Csv) { return @() }
              return $results
    }

    return Get-SharingLinksFromSite -SiteUrl $SiteUrl
}

$canParallel = $PSVersionTable.PSVersion.Major -ge 7
$shouldParallel = $canParallel -and $targetSites.Count -gt 1 -and $ThrottleLimit -gt 1
if ($StreamOutput -and $shouldParallel) {
  Write-Warning "StreamOutput forces sequential mode to avoid concurrent file writes."
  $shouldParallel = $false
}

$allLinks = @()
if ($shouldParallel) {
  Write-Host "PowerShell 7+ detected. Processing $($targetSites.Count) sites in parallel (ThrottleLimit $ThrottleLimit)." -ForegroundColor Green
  $allLinks = $targetSites | ForEach-Object -Parallel $processSiteBlock -ThrottleLimit $ThrottleLimit -ArgumentList $connectionInfo, $filters, $excludedLists, $reportPaths, $StreamOutput, $enableProgress
} else {
  if (-not $canParallel) {
    Write-Host "Parallel processing is disabled because PowerShell 7+ is not available. Falling back to sequential." -ForegroundColor Yellow
  }

  foreach ($site in $targetSites) {
    $allLinks += & $processSiteBlock $site $connectionInfo $filters $excludedLists $reportPaths $StreamOutput $enableProgress
  }
}

if (-not $allLinks -or $allLinks.Count -eq 0) {
  if (-not $StreamOutput) { Write-Warning "No sharing links found." }
  return
}

if (-not $StreamOutput) {
  $allLinks = $allLinks | Sort-Object -Property "Site Name", "Library", "File/Folder Name"

  if ($reportPaths.Csv) {
    $allLinks | Export-Csv -Path $reportPaths.Csv -NoTypeInformation -Force
  }
}

if ($reportPaths.Json) {
  $allLinks | ConvertTo-Json -Depth 6 | Set-Content -Path $reportPaths.Json -Encoding UTF8
}

$written = @()
if ($reportPaths.Csv) { $written += $reportPaths.Csv }
if ($reportPaths.Json) { $written += $reportPaths.Json }
Write-Host "Done. $($allLinks.Count) links exported to: $($written -join ', ')" -ForegroundColor Green

# Automatisch de CSV file openen (Finder op macOS, Explorer op Windows)
if ($reportPaths.Csv -and (Test-Path -LiteralPath $reportPaths.Csv)) {
    Write-Host "`nOpening output file..." -ForegroundColor Cyan
    if ($PSVersionTable.Platform -eq "Unix") {
        Start-Process -FilePath "open" -ArgumentList $reportPaths.Csv
    } else {
        Invoke-Item $reportPaths.Csv
    }
}
