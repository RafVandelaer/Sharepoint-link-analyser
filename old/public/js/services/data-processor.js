class DataProcessor {
  constructor(data) {
    this.data = data;
    this.stats = null;
  }

  processAll() {
    this.stats = {
      overview: this.calculateOverview(),
      topStats: this.calculateTopStats(),
      securityInsights: this.calculateSecurityInsights(),
      charts: this.prepareChartData(),
      treeData: this.buildTreeStructure()
    };
    return this.stats;
  }

  calculateOverview() {
    const total = this.data.length;
    const active = this.data.filter(item => item['Link Status'] === 'Active').length;
    const expired = this.data.filter(item => item['Link Status'] === 'Expired').length;
    const anonymous = this.data.filter(item => item['Link Type'] === 'Anonymous').length;
    const neverExpires = this.data.filter(item => 
      item['Friendly Expiry Time'] === 'Never Expires'
    ).length;

    return { total, active, expired, anonymous, neverExpires };
  }

  calculateTopStats() {
    const userCounts = {};
    const recipientCounts = {};
    const siteCounts = {};

    const sharerField = this.detectSharerField();

    this.data.forEach(item => {
      const linkType = item['Link Type'];
      const users = item['Users'] || '';
      if (users && linkType !== 'Anonymous') {
        users.split(',').forEach(user => {
          const email = user.trim();
          if (email) {
            recipientCounts[email] = (recipientCounts[email] || 0) + 1;
          }
        });
      }

      if (sharerField) {
        const sharer = (item[sharerField] || '').trim();
        if (sharer) {
          userCounts[sharer] = (userCounts[sharer] || 0) + 1;
        }
      }

      const site = item['Site Name'];
      if (site) {
        siteCounts[site] = (siteCounts[site] || 0) + 1;
      }
    });

    const sortEntries = (obj) => Object.entries(obj)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const sharerSource = Object.keys(userCounts).length ? userCounts : recipientCounts;

    return {
      topSharers: sortEntries(sharerSource),
      topRecipients: sortEntries(recipientCounts),
      topSites: sortEntries(siteCounts)
    };
  }

  detectSharerField() {
    if (!this.data || this.data.length === 0) return null;
    const candidates = [
      'Created By',
      'Created By Email',
      'Link Created By',
      'Shared By',
      'Owner',
      'Author'
    ];
    const sample = this.data[0];
    return candidates.find(field => field in sample) || null;
  }

  calculateSecurityInsights() {
    const anonymousLinks = this.data.filter(item => item['Link Type'] === 'Anonymous');
    const neverExpiringLinks = this.data.filter(item => 
      item['Friendly Expiry Time'] === 'Never Expires'
    );
    const passwordProtected = this.data.filter(item => 
      item['Password Protected'] === 'True'
    );
    const downloadBlocked = this.data.filter(item => 
      item['Block Download'] === 'True'
    );
    const soonToExpire = this.data.filter(item => {
      const days = parseInt(item['Days Since/To Expiry']);
      return !isNaN(days) && days >= 0 && days <= 30;
    });

    return {
      anonymousLinks,
      neverExpiringLinks,
      passwordProtected,
      downloadBlocked,
      soonToExpire
    };
  }

  prepareChartData() {
    const linkTypes = {};
    const accessTypes = {};
    const siteCounts = {};

    this.data.forEach(item => {
      const linkType = item['Link Type'];
      linkTypes[linkType] = (linkTypes[linkType] || 0) + 1;

      const accessType = item['Access Type'];
      accessTypes[accessType] = (accessTypes[accessType] || 0) + 1;

      const site = item['Site Name'];
      siteCounts[site] = (siteCounts[site] || 0) + 1;
    });

    const expiryTimeline = this.buildExpiryTimeline();

    return {
      linkTypeDistribution: Object.entries(linkTypes).map(([label, value]) => ({ label, value })),
      accessTypeDistribution: Object.entries(accessTypes).map(([label, value]) => ({ label, value })),
      linksPerSite: Object.entries(siteCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 15)
        .map(([label, value]) => ({ label, value })),
      expiryTimeline
    };
  }

  buildExpiryTimeline() {
    const today = new Date();
    const buckets = {
      'Expired': 0,
      '0-7 days': 0,
      '8-30 days': 0,
      '31-90 days': 0,
      '90+ days': 0,
      'Never': 0
    };

    this.data.forEach(item => {
      const expiryStr = item['Link Expiry Date'];
      const friendlyTime = item['Friendly Expiry Time'];

      if (friendlyTime === 'Never Expires' || expiryStr === '-') {
        buckets['Never']++;
      } else if (item['Link Status'] === 'Expired') {
        buckets['Expired']++;
      } else {
        const days = parseInt(item['Days Since/To Expiry']);
        if (!isNaN(days)) {
          if (days <= 7) buckets['0-7 days']++;
          else if (days <= 30) buckets['8-30 days']++;
          else if (days <= 90) buckets['31-90 days']++;
          else buckets['90+ days']++;
        }
      }
    });

    return Object.entries(buckets).map(([label, value]) => ({ label, value }));
  }

  buildTreeStructure() {
    const tree = {};

    this.data.forEach(item => {
      const siteName = item['Site Name'] || 'Unknown Site';
      const library = item['Library'] || 'Unknown Library';
      const objectType = item['Object Type'];
      const fileUrl = item['File/Folder URL'] || '';
      const fileName = item['File/Folder Name'];

      if (!tree[siteName]) {
        tree[siteName] = {
          name: siteName,
          type: 'site',
          children: {},
          linkCount: 0,
          anonymousCount: 0,
          neverExpiresCount: 0
        };
      }

      if (!tree[siteName].children[library]) {
        tree[siteName].children[library] = {
          name: library,
          type: 'library',
          children: {},
          linkCount: 0,
          anonymousCount: 0,
          neverExpiresCount: 0
        };
      }

      const pathParts = fileUrl.split('/').filter(p => p);
      const relevantParts = pathParts.slice(3);

      let currentLevel = tree[siteName].children[library].children;
      const folderNodes = [];
      
      // Build folder structure
      for (let i = 0; i < relevantParts.length - 1; i++) {
        const part = relevantParts[i];
        if (!currentLevel[part]) {
          currentLevel[part] = {
            name: part,
            type: 'folder',
            children: {},
            linkCount: 0,
            anonymousCount: 0,
            neverExpiresCount: 0,
            sharedLink: null
          };
        }
        folderNodes.push(currentLevel[part]);
        currentLevel = currentLevel[part].children;
      }
      
      // Handle folders - the last part is the folder itself
      if (objectType === 'Folder') {
        const folderName = fileName || relevantParts[relevantParts.length - 1];
        if (!currentLevel[folderName]) {
          currentLevel[folderName] = {
            name: folderName,
            type: 'folder',
            children: {},
            linkCount: 0,
            anonymousCount: 0,
            neverExpiresCount: 0,
            sharedLink: item['Shared Link'] || null,
            originalItem: item
          };
        }
        
        const folderNode = currentLevel[folderName];
        if (!folderNode.sharedLink && item['Shared Link']) {
          folderNode.sharedLink = item['Shared Link'];
        }
        if (!folderNode.originalItem) folderNode.originalItem = item;
        
        folderNode.linkCount++;
        if (item['Link Type'] === 'Anonymous') {
          folderNode.anonymousCount++;
        }
        if (item['Friendly Expiry Time'] === 'Never Expires') {
          folderNode.neverExpiresCount++;
        }
        
        const ancestors = [tree[siteName], tree[siteName].children[library], ...folderNodes];
        ancestors.forEach(node => this.incrementCounts(node, item));
      }

      if (objectType === 'File') {
        const fileKey = fileName || relevantParts[relevantParts.length - 1];
        if (!currentLevel[fileKey]) {
          currentLevel[fileKey] = {
            name: fileName,
            type: 'file',
            fileType: item['File Type'] || '',
            sharedLink: item['Shared Link'] || null,
            originalItem: item,
            links: [],
            linkCount: 0,
            anonymousCount: 0,
            neverExpiresCount: 0
          };
        }
        const fileNode = currentLevel[fileKey];
        fileNode.links.push(item);
        if (!fileNode.originalItem) fileNode.originalItem = item;
        fileNode.linkCount++;
        
        // Update sharedLink if not yet set
        if (!fileNode.sharedLink && item['Shared Link']) {
          fileNode.sharedLink = item['Shared Link'];
        }

        if (item['Link Type'] === 'Anonymous') {
          fileNode.anonymousCount++;
        }
        if (item['Friendly Expiry Time'] === 'Never Expires') {
          fileNode.neverExpiresCount++;
        }

        const ancestors = [tree[siteName], tree[siteName].children[library], ...folderNodes];
        ancestors.forEach(node => this.incrementCounts(node, item));
      }
    });

    return this.convertTreeToArray(tree);
  }

  incrementCounts(node, item) {
    node.linkCount++;
    if (item['Link Type'] === 'Anonymous') {
      node.anonymousCount++;
    }
    if (item['Friendly Expiry Time'] === 'Never Expires') {
      node.neverExpiresCount++;
    }
  }

  convertTreeToArray(tree) {
    const result = [];
    for (const key in tree) {
      const node = tree[key];
      if (node.children) {
        node.children = this.convertTreeToArray(node.children);
      }
      result.push(node);
    }
    return result;
  }

  filterData(filters) {
    let filtered = [...this.data];

    if (filters.linkType && filters.linkType !== 'all') {
      filtered = filtered.filter(item => item['Link Type'] === filters.linkType);
    }

    if (filters.linkStatus && filters.linkStatus !== 'all') {
      filtered = filtered.filter(item => item['Link Status'] === filters.linkStatus);
    }

    if (filters.accessType && filters.accessType !== 'all') {
      filtered = filtered.filter(item => item['Access Type'] === filters.accessType);
    }

    if (filters.site) {
      filtered = filtered.filter(item => 
        item['Site Name'].toLowerCase().includes(filters.site.toLowerCase())
      );
    }

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item['File/Folder Name'].toLowerCase().includes(term) ||
        item['Users'].toLowerCase().includes(term)
      );
    }

    return filtered;
  }
}

export default DataProcessor;
