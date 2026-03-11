class CSVParser {
  static parse(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) {
      throw new Error('CSV bestand is leeg');
    }

    const headers = this.parseCSVLine(lines[0]);
    
    // Validate headers for suspicious content
    this.validateHeaders(headers);
    
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        data.push(row);
      }
    }

    return { headers, data };
  }

  static parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  static validateHeaders(headers) {
    // Scan for suspicious content in headers
    const suspiciousPatterns = ['<script', 'javascript:', 'on', 'data:text/html'];
    
    for (const header of headers) {
      const lowerHeader = header.toLowerCase();
      for (const pattern of suspiciousPatterns) {
        if (lowerHeader.includes(pattern)) {
          throw new Error(`Verdachtige header gedetecteerd: "${header}"`);
        }
      }
    }
    
    return true;
  }

  static validateStructure(data) {
    const requiredFields = [
      'Site Name',
      'Library',
      'Object Type',
      'File/Folder Name',
      'Link Type',
      'Link Status'
    ];

    if (data.length === 0) {
      throw new Error('Geen data gevonden in het bestand');
    }

    const firstRow = data[0];
    const missingFields = requiredFields.filter(field => !(field in firstRow));

    if (missingFields.length > 0) {
      throw new Error(`Ontbrekende velden: ${missingFields.join(', ')}`);
    }

    return true;
  }

  static validateDataSafety(data) {
    // Scan for XSS patterns in data values
    const xssPatterns = ['<script', 'javascript:', 'onerror=', 'onload=', 'onclick=', 'data:text/html'];
    
    for (const row of data) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'string') {
          const lowerValue = value.toLowerCase();
          for (const pattern of xssPatterns) {
            if (lowerValue.includes(pattern)) {
              console.warn(`Potential XSS pattern in field "${key}": "${value.substring(0, 50)}..."`);
            }
          }
        }
      }
    }
    
    return true;
  }
}

export default CSVParser;
