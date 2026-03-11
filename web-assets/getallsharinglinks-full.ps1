[CmdletBinding()]
param(
    [string]$TenantName,
    [string]$OutputDirectory = ".",
    [switch]$IncludeOneDrive,
    [switch]$RecoveryOnly,
    [int]$MaxSites = 0,
    [int]$MaxLibrariesPerSite = 0,
    [int]$MaxItemsPerLibrary = 0
)

$ErrorActionPreference = "Stop"

function Get-InputValue {
    param(
        [string]$Prompt,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return (Read-Host $Prompt).Trim()
    }

    return $Value.Trim()
}

function Ensure-Directory {
    param(
        [Parameter(Mandatory)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -Path $Path -ItemType Directory -Force | Out-Null
    }

    return (Resolve-Path -LiteralPath $Path).Path
}

function Get-Timestamp {
    return (Get-Date -Format "yyyyMMdd-HHmmss")
}

function Get-SafePercent {
    param(
        [double]$Numerator,
        [double]$Denominator
    )

    if ($Denominator -le 0) { return 0 }

    $percent = [int](($Numerator / $Denominator) * 100)

    if ($percent -lt 0) { return 0 }
    if ($percent -gt 100) { return 100 }

    return $percent
}

function Import-PnPModule {
    if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
        throw "PnP.PowerShell is not installed. Install PnP.PowerShell first in PowerShell 7."
    }

    Import-Module PnP.PowerShell -ErrorAction Stop
}

$script:CurrentConnectedUrl = $null

function Connect-DelegatedPnP {
    param(
        [Parameter(Mandatory)][string]$Url,
        [switch]$ForceReconnect
    )

    if (-not $ForceReconnect -and $script:CurrentConnectedUrl -eq $Url) {
        return
    }

    Connect-PnPOnline -Url $Url -Interactive -ErrorAction Stop
    $script:CurrentConnectedUrl = $Url
}

function New-TenantPaths {
    param(
        [Parameter(Mandatory)][string]$BaseDirectory,
        [Parameter(Mandatory)][string]$TenantName,
        [Parameter(Mandatory)][string]$RunId
    )

    $tenantSafe = ($TenantName -replace '[^a-zA-Z0-9\-_]', '_')
    $tenantDirectory = Join-Path $BaseDirectory $tenantSafe

    if (-not (Test-Path -LiteralPath $tenantDirectory)) {
        New-Item -Path $tenantDirectory -ItemType Directory -Force | Out-Null
    }

    [PSCustomObject]@{
        TenantDirectory = $tenantDirectory
        StatePath       = Join-Path $tenantDirectory ("SharingLinks-{0}-RunState.json" -f $tenantSafe)
        EventLogPath    = Join-Path $tenantDirectory ("SharingLinks-{0}-Events.log" -f $tenantSafe)
        LockPath        = Join-Path $tenantDirectory ("SharingLinks-{0}.lock" -f $tenantSafe)
        CleanupQueue    = Join-Path $tenantDirectory ("SharingLinks-{0}-CleanupQueue.csv" -f $tenantSafe)
        CsvPath         = Join-Path $tenantDirectory ("SharingLinks-{0}-{1}.csv" -f $tenantSafe, $RunId)
        SummaryPath     = Join-Path $tenantDirectory ("SharingLinks-{0}-Summary-{1}.txt" -f $tenantSafe, $RunId)
    }
}

function Write-EventLog {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Message,
        [ValidateSet("INFO","WARN","ERROR")][string]$Level = "INFO"
    )

    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Add-Content -LiteralPath $Path -Value $line -Encoding UTF8
}

function Load-State {
    param(
        [Parameter(Mandatory)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $null
    }

    return ($raw | ConvertFrom-Json -Depth 30)
}

function Save-State {
    param(
        [Parameter(Mandatory)]$State,
        [Parameter(Mandatory)][string]$Path
    )

    $tmpPath = "$Path.tmp"
    $json = $State | ConvertTo-Json -Depth 30
    Set-Content -LiteralPath $tmpPath -Value $json -Encoding UTF8
    Move-Item -LiteralPath $tmpPath -Destination $Path -Force
}

function Initialize-CleanupQueue {
    param(
        [Parameter(Mandatory)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        [PSCustomObject]@{
            Timestamp        = "Timestamp"
            SiteUrl          = "SiteUrl"
            UserLogin        = "UserLogin"
            AddedByScript    = "AddedByScript"
            CleanupCompleted = "CleanupCompleted"
            RunId            = "RunId"
        } | Export-Csv -LiteralPath $Path -NoTypeInformation -Encoding UTF8
    }
}

function Append-CleanupQueue {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$SiteUrl,
        [Parameter(Mandatory)][string]$UserLogin,
        [Parameter(Mandatory)][bool]$AddedByScript,
        [Parameter(Mandatory)][bool]$CleanupCompleted,
        [Parameter(Mandatory)][string]$RunId
    )

    $row = [PSCustomObject]@{
        Timestamp        = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        SiteUrl          = $SiteUrl
        UserLogin        = $UserLogin
        AddedByScript    = $AddedByScript
        CleanupCompleted = $CleanupCompleted
        RunId            = $RunId
    }

    $row | Export-Csv -LiteralPath $Path -Append -NoTypeInformation -Encoding UTF8
}

function New-LockFile {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$RunId,
        [Parameter(Mandatory)][string]$TenantName
    )

    if (Test-Path -LiteralPath $Path) {
        $existing = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
        throw "A lock file already exists for tenant '$TenantName'. Another run may still be active, or a previous run was not closed cleanly. Lock file: $Path`nContent:`n$existing"
    }

    $lockInfo = [PSCustomObject]@{
        RunId      = $RunId
        TenantName = $TenantName
        StartedAt  = (Get-Date).ToString("o")
        User       = [Environment]::UserName
        Machine    = $env:COMPUTERNAME
        ProcessId  = $PID
    }

    $lockInfo | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Remove-LockFileSafe {
    param(
        [Parameter(Mandatory)][string]$Path
    )

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    }
}

function New-InitialState {
    param(
        [Parameter(Mandatory)][string]$RunId,
        [Parameter(Mandatory)][string]$TenantName,
        [Parameter(Mandatory)][string]$BaseDirectory,
        [Parameter(Mandatory)][string]$CsvPath,
        [Parameter(Mandatory)][string]$EventLogPath
    )

    [PSCustomObject]@{
        RunId                = $RunId
        Mode                 = "DelegatedTemporarySCA"
        TenantName           = $TenantName
        StartedAt            = (Get-Date).ToString("o")
        CompletedAt          = $null
        RunCompleted         = $false
        RecoveryCompleted    = $false
        CsvPath              = $CsvPath
        EventLogPath         = $EventLogPath
        BaseDirectory        = $BaseDirectory
        CurrentUserLogin     = $null
        CurrentUserTitle     = $null
        AddedAdminCount      = 0
        LinksFound           = 0
        FilesScanned         = 0
        FoldersScanned       = 0
        SitesProcessed       = 0
        LibrariesProcessed   = 0
        ItemsProcessed       = 0
        CurrentSiteIndex     = 0
        CurrentLibraryTitle  = $null
        CurrentItemName      = $null
        Sites                = @()
    }
}

function Get-OrCreateSiteState {
    param(
        [Parameter(Mandatory)]$State,
        [Parameter(Mandatory)][string]$SiteUrl
    )

    $existing = @($State.Sites | Where-Object { $_.SiteUrl -eq $SiteUrl })
    if ($existing.Count -gt 0) {
        return $existing[0]
    }

    $siteState = [PSCustomObject]@{
        SiteUrl                       = $SiteUrl
        SiteTitle                     = $null
        WasAlreadySiteCollectionAdmin = $false
        TemporaryAdminAddedByScript   = $false
        ScanCompleted                 = $false
        CleanupCompleted              = $false
        LastError                     = $null
        LibrariesProcessed            = 0
        ItemsProcessed                = 0
        FilesScanned                  = 0
        FoldersScanned                = 0
        LinksFound                    = 0
        WarningCount                  = 0
        LastWarning                   = $null
        LastUpdatedAt                 = (Get-Date).ToString("o")
    }

    $State.Sites += $siteState
    return $siteState
}

function Update-SiteStateTimestamp {
    param(
        [Parameter(Mandatory)]$SiteState
    )

    $SiteState.LastUpdatedAt = (Get-Date).ToString("o")
}

function Get-SafePropertyValue {
    param(
        $Object,
        [string]$PropertyName
    )

    if ($null -eq $Object) { return $null }

    if ($Object.PSObject.Properties.Name -contains $PropertyName) {
        return $Object.$PropertyName
    }

    return $null
}

function Convert-LinkKind {
    param([object]$Type)

    if ($null -eq $Type) { return $null }

    switch ($Type.ToString()) {
        "View"   { return "View" }
        "Edit"   { return "Edit" }
        "Review" { return "Review" }
        "Embed"  { return "Embed" }
        default  { return $Type.ToString() }
    }
}

function Get-CreatedByString {
    param($Link)

    $createdByObject = Get-SafePropertyValue -Object $Link -PropertyName "CreatedBy"
    if (-not $createdByObject) { return $null }

    if ($createdByObject.Email) { return $createdByObject.Email }
    if ($createdByObject.LoginName) { return $createdByObject.LoginName }

    return $null
}

function Get-GrantedToString {
    param($Link)

    $grantedToIdentities = Get-SafePropertyValue -Object $Link -PropertyName "GrantedToIdentitiesV2"
    if (-not $grantedToIdentities) { return $null }

    $values = foreach ($entry in $grantedToIdentities) {
        if ($entry.User -and $entry.User.Email) {
            $entry.User.Email
        }
        elseif ($entry.SiteUser -and $entry.SiteUser.Email) {
            $entry.SiteUser.Email
        }
        elseif ($entry.Group -and $entry.Group.DisplayName) {
            $entry.Group.DisplayName
        }
    }

    $values = @($values | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($values.Count -eq 0) { return $null }

    return ($values -join "; ")
}

function Get-RelevantLibraries {
    $skipTitles = @(
        "Form Templates",
        "Site Assets",
        "Site Pages",
        "Sitepagina's",
        "Style Library",
        "Stijlbibliotheek",
        "Images",
        "Converted Forms",
        "Preservation Hold Library",
        "Teams Wiki Data"
    )

    return @(
        Get-PnPList | Where-Object {
            $_.BaseType -eq "DocumentLibrary" -and
            -not $_.Hidden -and
            $_.Title -notin $skipTitles
        } | Sort-Object Title
    )
}

function Get-LibraryItems {
    param(
        [Parameter(Mandatory)]$Library
    )

    return @(
        Get-PnPListItem `
            -List $Library `
            -PageSize 1000 `
            -Fields "FileRef","FileLeafRef","FSObjType","HasUniqueRoleAssignments"
    )
}

function Get-CurrentUserInfoSafe {
    try {
        $web = Get-PnPWeb
        Get-PnPProperty -ClientObject $web -Property CurrentUser | Out-Null

        $email = $null
        if ($web.CurrentUser.Email) { $email = $web.CurrentUser.Email }

        return [PSCustomObject]@{
            LoginName = $web.CurrentUser.LoginName
            Title     = $web.CurrentUser.Title
            Email     = $email
        }
    }
    catch {
        return $null
    }
}

function Test-IsCurrentUserSiteCollectionAdmin {
    param(
        [Parameter(Mandatory)][string]$CurrentUserLogin
    )

    try {
        $admins = @(Get-PnPSiteCollectionAdmin)

        $matches = @($admins | Where-Object {
            $_.LoginName -eq $CurrentUserLogin
        })

        return [PSCustomObject]@{
            IsAdmin = [bool]($matches.Count -gt 0)
            Matches = $matches
        }
    }
    catch {
        throw "Could not retrieve Site Collection Administrators. Error: $($_.Exception.Message)"
    }
}

function Add-TemporarySiteCollectionAdmin {
    param(
        [Parameter(Mandatory)][string]$CurrentUserLogin
    )

    Add-PnPSiteCollectionAdmin -Owners $CurrentUserLogin -ErrorAction Stop
}

function Remove-TemporarySiteCollectionAdminSafe {
    param(
        [Parameter(Mandatory)][string]$CurrentUserLogin
    )

    Remove-PnPSiteCollectionAdmin -Owners $CurrentUserLogin -ErrorAction Stop
}

function Ensure-UserIsTemporarySiteCollectionAdmin {
    param(
        [Parameter(Mandatory)][string]$CurrentUserLogin,
        [Parameter(Mandatory)][string]$SiteUrl,
        [Parameter(Mandatory)]$SiteState,
        [Parameter(Mandatory)]$State,
        [Parameter(Mandatory)][string]$StatePath,
        [Parameter(Mandatory)][string]$EventLogPath,
        [Parameter(Mandatory)][string]$CleanupQueuePath
    )

    $adminCheck = Test-IsCurrentUserSiteCollectionAdmin -CurrentUserLogin $CurrentUserLogin
    $SiteState.WasAlreadySiteCollectionAdmin = $adminCheck.IsAdmin

    if ($adminCheck.IsAdmin) {
        Update-SiteStateTimestamp -SiteState $SiteState
        Save-State -State $State -Path $StatePath
        return $false
    }

    Add-TemporarySiteCollectionAdmin -CurrentUserLogin $CurrentUserLogin
    Start-Sleep -Milliseconds 250

    $verify = Test-IsCurrentUserSiteCollectionAdmin -CurrentUserLogin $CurrentUserLogin
    if (-not $verify.IsAdmin) {
        throw "Verification failed: the user was not added as Site Collection Administrator on $SiteUrl."
    }

    $SiteState.TemporaryAdminAddedByScript = $true
    $SiteState.CleanupCompleted = $false
    Update-SiteStateTimestamp -SiteState $SiteState

    $State.AddedAdminCount++
    Save-State -State $State -Path $StatePath

    Append-CleanupQueue `
        -Path $CleanupQueuePath `
        -SiteUrl $SiteUrl `
        -UserLogin $CurrentUserLogin `
        -AddedByScript $true `
        -CleanupCompleted $false `
        -RunId $State.RunId

    Write-EventLog -Path $EventLogPath -Message ("Temporary Site Collection Administrator access granted on {0}" -f $SiteUrl) -Level "INFO"
    return $true
}

function Cleanup-TemporarySiteCollectionAdmin {
    param(
        [Parameter(Mandatory)][string]$CurrentUserLogin,
        [Parameter(Mandatory)][string]$SiteUrl,
        [Parameter(Mandatory)]$SiteState,
        [Parameter(Mandatory)]$State,
        [Parameter(Mandatory)][string]$StatePath,
        [Parameter(Mandatory)][string]$EventLogPath,
        [Parameter(Mandatory)][string]$CleanupQueuePath
    )

    if ($SiteState.TemporaryAdminAddedByScript -ne $true -or $SiteState.CleanupCompleted -eq $true) {
        return
    }

    Remove-TemporarySiteCollectionAdminSafe -CurrentUserLogin $CurrentUserLogin
    Start-Sleep -Milliseconds 250

    $verify = Test-IsCurrentUserSiteCollectionAdmin -CurrentUserLogin $CurrentUserLogin
    if ($verify.IsAdmin) {
        throw "Verification failed: the user still appears to be Site Collection Administrator on $SiteUrl."
    }

    $SiteState.TemporaryAdminAddedByScript = $false
    $SiteState.CleanupCompleted = $true
    Update-SiteStateTimestamp -SiteState $SiteState
    Save-State -State $State -Path $StatePath

    Append-CleanupQueue `
        -Path $CleanupQueuePath `
        -SiteUrl $SiteUrl `
        -UserLogin $CurrentUserLogin `
        -AddedByScript $true `
        -CleanupCompleted $true `
        -RunId $State.RunId

    Write-EventLog -Path $EventLogPath -Message ("Temporary Site Collection Administrator access removed on {0}" -f $SiteUrl) -Level "INFO"
}

function Get-FolderSharingLinksSafe {
    param(
        [Parameter(Mandatory)][string]$ServerRelativeUrl
    )

    $links = $null

    try {
        $links = Get-PnPFolderSharingLink -Folder $ServerRelativeUrl -ErrorAction Stop
        return @($links)
    }
    catch {
    }

    try {
        $folder = Get-PnPFolder -Url $ServerRelativeUrl -ErrorAction Stop
        $links = $folder | Get-PnPFolderSharingLink -ErrorAction Stop
        return @($links)
    }
    catch {
    }

    return @()
}

function Get-FileSharingLinksSafe {
    param(
        [Parameter(Mandatory)]$Item
    )

    try {
        $links = $Item | Get-PnPFileSharingLink -ErrorAction Stop
        return @($links)
    }
    catch {
        return @()
    }
}

function New-LinkRow {
    param(
        [Parameter(Mandatory)][string]$RunId,
        [Parameter(Mandatory)][string]$SiteTitle,
        [Parameter(Mandatory)][string]$SiteUrl,
        [Parameter(Mandatory)][string]$LibraryTitle,
        [Parameter(Mandatory)]$Item,
        [Parameter(Mandatory)]$Link,
        [Parameter(Mandatory)][string]$ItemType
    )

    [PSCustomObject]@{
        RunId                    = $RunId
        ExportedAt               = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        SiteTitle                = $SiteTitle
        SiteUrl                  = $SiteUrl
        LibraryTitle             = $LibraryTitle
        ItemId                   = $Item.Id
        ItemName                 = $Item["FileLeafRef"]
        ItemPath                 = $Item["FileRef"]
        ItemType                 = $ItemType
        HasUniqueRoleAssignments = [bool]$Item["HasUniqueRoleAssignments"]
        LinkId                   = Get-SafePropertyValue -Object $Link -PropertyName "Id"
        LinkKind                 = Convert-LinkKind -Type (Get-SafePropertyValue -Object $Link -PropertyName "LinkKind")
        LinkType                 = Get-SafePropertyValue -Object $Link -PropertyName "Type"
        Scope                    = Get-SafePropertyValue -Object $Link -PropertyName "Scope"
        LinkUrl                  = Get-SafePropertyValue -Object $Link -PropertyName "WebUrl"
        Created                  = Get-SafePropertyValue -Object $Link -PropertyName "CreatedDateTime"
        Expiration               = Get-SafePropertyValue -Object $Link -PropertyName "ExpirationDateTime"
        PreventsDownload         = Get-SafePropertyValue -Object $Link -PropertyName "PreventsDownload"
        BlocksDownload           = Get-SafePropertyValue -Object $Link -PropertyName "BlocksDownload"
        HasPassword              = Get-SafePropertyValue -Object $Link -PropertyName "HasPassword"
        CreatedBy                = Get-CreatedByString -Link $Link
        GrantedTo                = Get-GrantedToString -Link $Link
    }
}

function Initialize-CsvFile {
    param(
        [Parameter(Mandatory)][string]$CsvPath
    )

    if (-not (Test-Path -LiteralPath $CsvPath)) {
        @() | Select-Object RunId,ExportedAt,SiteTitle,SiteUrl,LibraryTitle,ItemId,ItemName,ItemPath,ItemType,HasUniqueRoleAssignments,LinkId,LinkKind,LinkType,Scope,LinkUrl,Created,Expiration,PreventsDownload,BlocksDownload,HasPassword,CreatedBy,GrantedTo |
            Export-Csv -Path $CsvPath -NoTypeInformation -Encoding UTF8
    }
}

function Append-LinkRowsToCsv {
    param(
        [Parameter(Mandatory)][string]$CsvPath,
        [Parameter(Mandatory)][System.Collections.Generic.List[object]]$Rows
    )

    if ($Rows.Count -eq 0) {
        return
    }

    $Rows | Export-Csv -Path $CsvPath -Append -NoTypeInformation -Encoding UTF8
}

function Recover-AbortedRun {
    param(
        [Parameter(Mandatory)]$State,
        [Parameter(Mandatory)][string]$StatePath,
        [Parameter(Mandatory)][string]$EventLogPath,
        [Parameter(Mandatory)][string]$TenantName,
        [Parameter(Mandatory)][string]$CleanupQueuePath
    )

    if ($State.RunCompleted -eq $true) {
        return
    }

    Write-Host ""
    Write-Host "A previous incomplete run was found. Recovery will be performed first..." -ForegroundColor Yellow
    Write-EventLog -Path $EventLogPath -Message ("Recovery started for previous run {0}" -f $State.RunId) -Level "WARN"

    $adminUrl = "https://$TenantName-admin.sharepoint.com"
    Connect-DelegatedPnP -Url $adminUrl -ForceReconnect

    $userInfo = Get-CurrentUserInfoSafe
    if ($null -eq $userInfo -or [string]::IsNullOrWhiteSpace($userInfo.LoginName)) {
        throw "Could not determine the current user during recovery."
    }

    foreach ($siteState in @($State.Sites | Where-Object {
        $_.TemporaryAdminAddedByScript -eq $true -and $_.CleanupCompleted -eq $false
    })) {
        try {
            Connect-DelegatedPnP -Url $siteState.SiteUrl -ForceReconnect

            Cleanup-TemporarySiteCollectionAdmin `
                -CurrentUserLogin $userInfo.LoginName `
                -SiteUrl $siteState.SiteUrl `
                -SiteState $siteState `
                -State $State `
                -StatePath $StatePath `
                -EventLogPath $EventLogPath `
                -CleanupQueuePath $CleanupQueuePath

            $siteState.LastError = $null
            Update-SiteStateTimestamp -SiteState $siteState
            Save-State -State $State -Path $StatePath

            Write-Host ("Recovery cleanup completed for: {0}" -f $siteState.SiteUrl) -ForegroundColor Green
        }
        catch {
            $siteState.LastError = $_.Exception.Message
            Update-SiteStateTimestamp -SiteState $siteState
            Save-State -State $State -Path $StatePath

            Write-Host ("Recovery cleanup failed for: {0}" -f $siteState.SiteUrl) -ForegroundColor Red
            Write-EventLog -Path $EventLogPath -Message ("Recovery cleanup failed for {0}. Error: {1}" -f $siteState.SiteUrl, $_.Exception.Message) -Level "ERROR"
            throw
        }
    }

    $State.RecoveryCompleted = $true
    Save-State -State $State -Path $StatePath
    Write-EventLog -Path $EventLogPath -Message ("Recovery completed for previous run {0}" -f $State.RunId) -Level "INFO"

    Write-Host "Recovery completed." -ForegroundColor Green
}

function Write-RunSummary {
    param(
        [Parameter(Mandatory)]$State,
        [Parameter(Mandatory)][string]$SummaryPath
    )

    $sitesWithLinks = @($State.Sites | Where-Object { $_.LinksFound -gt 0 }).Count

    $summary = @()
    $summary += "RunId: $($State.RunId)"
    $summary += "Mode: $($State.Mode)"
    $summary += "Tenant: $($State.TenantName)"
    $summary += "StartedAt: $($State.StartedAt)"
    $summary += "CompletedAt: $($State.CompletedAt)"
    $summary += "RunCompleted: $($State.RunCompleted)"
    $summary += "SitesProcessed: $($State.SitesProcessed)"
    $summary += "LibrariesProcessed: $($State.LibrariesProcessed)"
    $summary += "ItemsProcessed: $($State.ItemsProcessed)"
    $summary += "FilesScanned: $($State.FilesScanned)"
    $summary += "FoldersScanned: $($State.FoldersScanned)"
    $summary += "LinksFound: $($State.LinksFound)"
    $summary += "SitesWithLinks: $sitesWithLinks"
    $summary += "TemporaryAdminsAdded: $($State.AddedAdminCount)"

    Set-Content -LiteralPath $SummaryPath -Value $summary -Encoding UTF8
}

Import-PnPModule

$TenantName = Get-InputValue -Prompt "Tenant short name (e.g. contoso or sebastianmortelmans)" -Value $TenantName
$OutputDirectory = Ensure-Directory -Path $OutputDirectory

$preRunId = Get-Timestamp
$tenantPaths = New-TenantPaths -BaseDirectory $OutputDirectory -TenantName $TenantName -RunId $preRunId
Initialize-CleanupQueue -Path $tenantPaths.CleanupQueue

$existingState = Load-State -Path $tenantPaths.StatePath

if ($null -ne $existingState -and $existingState.RunCompleted -ne $true) {
    Recover-AbortedRun `
        -State $existingState `
        -StatePath $tenantPaths.StatePath `
        -EventLogPath $tenantPaths.EventLogPath `
        -TenantName $TenantName `
        -CleanupQueuePath $tenantPaths.CleanupQueue
}

if ($RecoveryOnly) {
    Write-Host "Recovery-only mode completed." -ForegroundColor Green
    return
}

$runId = Get-Timestamp
$paths = New-TenantPaths -BaseDirectory $OutputDirectory -TenantName $TenantName -RunId $runId

New-LockFile -Path $paths.LockPath -RunId $runId -TenantName $TenantName

$state = New-InitialState `
    -RunId $runId `
    -TenantName $TenantName `
    -BaseDirectory $paths.TenantDirectory `
    -CsvPath $paths.CsvPath `
    -EventLogPath $paths.EventLogPath

Save-State -State $state -Path $paths.StatePath
Initialize-CsvFile -CsvPath $paths.CsvPath
Write-EventLog -Path $paths.EventLogPath -Message ("New run started: {0}" -f $runId) -Level "INFO"

try {
    $adminUrl = "https://$TenantName-admin.sharepoint.com"

    Write-Host ""
    Write-Host "Connecting to admin site..." -ForegroundColor Cyan
    Connect-DelegatedPnP -Url $adminUrl -ForceReconnect

    $userInfo = Get-CurrentUserInfoSafe
    if ($null -eq $userInfo -or [string]::IsNullOrWhiteSpace($userInfo.LoginName)) {
        throw "Could not determine the current user."
    }

    $state.CurrentUserLogin = $userInfo.LoginName
    $state.CurrentUserTitle = $userInfo.Title
    Save-State -State $state -Path $paths.StatePath

    Write-EventLog -Path $paths.EventLogPath -Message ("Signed-in user: {0}" -f $userInfo.LoginName) -Level "INFO"

    Write-Host "Retrieving site collections..." -ForegroundColor Cyan
    $sites = @(
        Get-PnPTenantSite | Where-Object {
            if ($IncludeOneDrive) {
                $true
            }
            else {
                $_.Url -notlike "*/personal/*"
            }
        } | Sort-Object Url
    )

    if ($MaxSites -gt 0) {
        $sites = @($sites | Select-Object -First $MaxSites)
    }

    if ($sites.Count -eq 0) {
        throw "No sites found."
    }

    Write-Host ("Number of sites: {0}" -f $sites.Count) -ForegroundColor Yellow
    Write-EventLog -Path $paths.EventLogPath -Message ("Number of sites found: {0}" -f $sites.Count) -Level "INFO"

    for ($siteIndex = 0; $siteIndex -lt $sites.Count; $siteIndex++) {
        $site = $sites[$siteIndex]
        $state.CurrentSiteIndex = $siteIndex + 1
        $state.CurrentLibraryTitle = $null
        $state.CurrentItemName = $null
        Save-State -State $state -Path $paths.StatePath

        $sitePercent = Get-SafePercent -Numerator ($siteIndex + 1) -Denominator $sites.Count

        Write-Progress `
            -Id 0 `
            -Activity "Scanning sites" `
            -Status ("{0} / {1} | Links: {2} | Temporary admin grants: {3}" -f ($siteIndex + 1), $sites.Count, $state.LinksFound, $state.AddedAdminCount) `
            -PercentComplete $sitePercent

        $siteState = Get-OrCreateSiteState -State $state -SiteUrl $site.Url

        try {
            Connect-DelegatedPnP -Url $site.Url

            $web = Get-PnPWeb -Includes Title, Url
            $siteTitle = $web.Title
            $siteUrl = $web.Url.TrimEnd('/')

            $siteState.SiteTitle = $siteTitle
            Update-SiteStateTimestamp -SiteState $siteState
            Save-State -State $state -Path $paths.StatePath

            Write-Host ""
            Write-Host ("[{0}/{1}] Site: {2} ({3})" -f ($siteIndex + 1), $sites.Count, $siteTitle, $siteUrl) -ForegroundColor Yellow
            Write-EventLog -Path $paths.EventLogPath -Message ("Site scan started: {0}" -f $siteUrl) -Level "INFO"

            $adminAdded = Ensure-UserIsTemporarySiteCollectionAdmin `
                -CurrentUserLogin $userInfo.LoginName `
                -SiteUrl $siteUrl `
                -SiteState $siteState `
                -State $state `
                -StatePath $paths.StatePath `
                -EventLogPath $paths.EventLogPath `
                -CleanupQueuePath $paths.CleanupQueue

            if ($adminAdded) {
                Write-Host "  Temporary Site Collection Administrator access granted." -ForegroundColor Cyan
                Connect-DelegatedPnP -Url $site.Url -ForceReconnect
            }

            $libraries = @(Get-RelevantLibraries)
            if ($MaxLibrariesPerSite -gt 0) {
                $libraries = @($libraries | Select-Object -First $MaxLibrariesPerSite)
            }

            if ($libraries.Count -eq 0) {
                Write-Host "  No relevant document libraries found." -ForegroundColor DarkYellow
                $siteState.ScanCompleted = $true
                $state.SitesProcessed++
                Update-SiteStateTimestamp -SiteState $siteState
                Save-State -State $state -Path $paths.StatePath
                continue
            }

            for ($libIndex = 0; $libIndex -lt $libraries.Count; $libIndex++) {
                $library = $libraries[$libIndex]
                $state.LibrariesProcessed++
                $siteState.LibrariesProcessed++
                $state.CurrentLibraryTitle = $library.Title
                Save-State -State $state -Path $paths.StatePath

                $libPercent = Get-SafePercent -Numerator ($libIndex + 1) -Denominator $libraries.Count

                Write-Progress `
                    -Id 1 `
                    -Activity ("Scanning libraries on {0}" -f $siteTitle) `
                    -Status ("{0} / {1} | Site links: {2} | Total links: {3}" -f ($libIndex + 1), $libraries.Count, $siteState.LinksFound, $state.LinksFound) `
                    -PercentComplete $libPercent

                Write-Host ("  Library: {0}" -f $library.Title) -ForegroundColor Cyan

                try {
                    $items = @(Get-LibraryItems -Library $library)
                    if ($MaxItemsPerLibrary -gt 0) {
                        $items = @($items | Select-Object -First $MaxItemsPerLibrary)
                    }
                }
                catch {
                    $siteState.WarningCount++
                    $siteState.LastWarning = $_.Exception.Message
                    Save-State -State $state -Path $paths.StatePath

                    Write-Warning ("Could not retrieve items from '{0}' on '{1}'. Error: {2}" -f $library.Title, $siteUrl, $_.Exception.Message)
                    Write-EventLog -Path $paths.EventLogPath -Message ("Could not retrieve items from {0} on {1}. Error: {2}" -f $library.Title, $siteUrl, $_.Exception.Message) -Level "WARN"
                    continue
                }

                $libraryLinksFound = 0

                for ($itemIndex = 0; $itemIndex -lt $items.Count; $itemIndex++) {
                    $item = $items[$itemIndex]
                    $state.ItemsProcessed++
                    $siteState.ItemsProcessed++
                    $itemPercent = Get-SafePercent -Numerator ($itemIndex + 1) -Denominator $items.Count

                    $itemName = $item["FileLeafRef"]
                    if ([string]::IsNullOrWhiteSpace($itemName)) {
                        $itemName = "[unnamed item]"
                    }

                    $state.CurrentItemName = $itemName
                    Save-State -State $state -Path $paths.StatePath

                    $isFolder = ($item["FSObjType"] -eq 1)
                    if ($isFolder) {
                        $state.FoldersScanned++
                        $siteState.FoldersScanned++
                        $itemType = "Folder"
                    }
                    else {
                        $state.FilesScanned++
                        $siteState.FilesScanned++
                        $itemType = "File"
                    }

                    Write-Progress `
                        -Id 2 `
                        -Activity ("Scanning items in {0}" -f $library.Title) `
                        -Status ("{0} / {1} | Item: {2} | Type: {3} | Library links: {4} | Site links: {5} | Total links: {6}" -f ($itemIndex + 1), $items.Count, $itemName, $itemType, $libraryLinksFound, $siteState.LinksFound, $state.LinksFound) `
                        -PercentComplete $itemPercent

                    $serverRelativeUrl = $item["FileRef"]

                    if ([string]::IsNullOrWhiteSpace($serverRelativeUrl)) {
                        continue
                    }

                    try {
                        if ($isFolder) {
                            $links = @(Get-FolderSharingLinksSafe -ServerRelativeUrl $serverRelativeUrl)
                        }
                        else {
                            $links = @(Get-FileSharingLinksSafe -Item $item)
                        }

                        if ($links.Count -gt 0) {
                            $buffer = New-Object System.Collections.Generic.List[object]

                            foreach ($link in $links) {
                                $row = New-LinkRow `
                                    -RunId $state.RunId `
                                    -SiteTitle $siteTitle `
                                    -SiteUrl $siteUrl `
                                    -LibraryTitle $library.Title `
                                    -Item $item `
                                    -Link $link `
                                    -ItemType $itemType

                                $buffer.Add($row)
                                $state.LinksFound++
                                $siteState.LinksFound++
                                $libraryLinksFound++
                            }

                            Append-LinkRowsToCsv -CsvPath $paths.CsvPath -Rows $buffer
                            Save-State -State $state -Path $paths.StatePath
                        }
                    }
                    catch {
                        $siteState.WarningCount++
                        $siteState.LastWarning = $_.Exception.Message
                        Save-State -State $state -Path $paths.StatePath

                        Write-EventLog -Path $paths.EventLogPath -Message ("Could not retrieve sharing links for item {0} in library {1}. Error: {2}" -f $itemName, $library.Title, $_.Exception.Message) -Level "WARN"
                    }

                    if ((($itemIndex + 1) % 250) -eq 0) {
                        Write-Host ("    Progress: {0} items | files: {1} | folders: {2} | library links: {3} | site links: {4} | total links: {5} | site warnings: {6}" -f ($itemIndex + 1), $siteState.FilesScanned, $siteState.FoldersScanned, $libraryLinksFound, $siteState.LinksFound, $state.LinksFound, $siteState.WarningCount) -ForegroundColor DarkCyan
                        Save-State -State $state -Path $paths.StatePath
                        Start-Sleep -Milliseconds 150
                    }
                }

                Write-Progress -Id 2 -Activity ("Scanning items in {0}" -f $library.Title) -Completed
                Write-Host ("    Completed library '{0}'. Links found in this library: {1}. Total links: {2}" -f $library.Title, $libraryLinksFound, $state.LinksFound) -ForegroundColor Green
                Save-State -State $state -Path $paths.StatePath
            }

            Write-Progress -Id 1 -Activity ("Scanning libraries on {0}" -f $siteTitle) -Completed

            $siteState.ScanCompleted = $true
            $state.SitesProcessed++
            $siteState.LastError = $null
            Update-SiteStateTimestamp -SiteState $siteState
            Save-State -State $state -Path $paths.StatePath

            Write-Host ("  Site completed. Site links: {0}. Total links: {1}. Files scanned: {2}. Folders scanned: {3}. Site warnings: {4}" -f $siteState.LinksFound, $state.LinksFound, $siteState.FilesScanned, $siteState.FoldersScanned, $siteState.WarningCount) -ForegroundColor Green
            Write-EventLog -Path $paths.EventLogPath -Message ("Site scan completed: {0}. Site links: {1}. Files scanned: {2}. Folders scanned: {3}. Warnings: {4}" -f $siteUrl, $siteState.LinksFound, $siteState.FilesScanned, $siteState.FoldersScanned, $siteState.WarningCount) -Level "INFO"
        }
        catch {
            $siteState.LastError = $_.Exception.Message
            Update-SiteStateTimestamp -SiteState $siteState
            Save-State -State $state -Path $paths.StatePath

            Write-Warning ("Site skipped: {0}. Error: {1}" -f $site.Url, $_.Exception.Message)
            Write-EventLog -Path $paths.EventLogPath -Message ("Site skipped: {0}. Error: {1}" -f $site.Url, $_.Exception.Message) -Level "ERROR"
        }
        finally {
            try {
                Connect-DelegatedPnP -Url $site.Url
                Cleanup-TemporarySiteCollectionAdmin `
                    -CurrentUserLogin $userInfo.LoginName `
                    -SiteUrl $site.Url `
                    -SiteState $siteState `
                    -State $state `
                    -StatePath $paths.StatePath `
                    -EventLogPath $paths.EventLogPath `
                    -CleanupQueuePath $paths.CleanupQueue
            }
            catch {
                $siteState.LastError = $_.Exception.Message
                Update-SiteStateTimestamp -SiteState $siteState
                Save-State -State $state -Path $paths.StatePath

                Write-Warning ("Cleanup failed for site: {0}. Error: {1}" -f $site.Url, $_.Exception.Message)
                Write-EventLog -Path $paths.EventLogPath -Message ("Cleanup failed for site {0}. Error: {1}" -f $site.Url, $_.Exception.Message) -Level "ERROR"
                throw
            }
        }
    }

    Write-Progress -Id 0 -Activity "Scanning sites" -Completed

    $state.RunCompleted = $true
    $state.CompletedAt = (Get-Date).ToString("o")
    Save-State -State $state -Path $paths.StatePath
    Write-RunSummary -State $state -SummaryPath $paths.SummaryPath

    Write-EventLog -Path $paths.EventLogPath -Message ("Run completed successfully. Links found: {0}" -f $state.LinksFound) -Level "INFO"

    Write-Host ""
    Write-Host ("Completed. Sites: {0} | Libraries: {1} | Items: {2} | Files: {3} | Folders: {4} | Sharing links: {5}" -f $sites.Count, $state.LibrariesProcessed, $state.ItemsProcessed, $state.FilesScanned, $state.FoldersScanned, $state.LinksFound) -ForegroundColor Green
    Write-Host ("CSV: {0}" -f $paths.CsvPath) -ForegroundColor Green
    Write-Host ("State: {0}" -f $paths.StatePath) -ForegroundColor Green
    Write-Host ("Events: {0}" -f $paths.EventLogPath) -ForegroundColor Green
    Write-Host ("CleanupQueue: {0}" -f $paths.CleanupQueue) -ForegroundColor Green
    Write-Host ("Summary: {0}" -f $paths.SummaryPath) -ForegroundColor Green
}
catch {
    Write-EventLog -Path $paths.EventLogPath -Message ("Run crashed. Error: {0}" -f $_.Exception.Message) -Level "ERROR"
    throw
}
finally {
    Remove-LockFileSafe -Path $paths.LockPath
}