# VPS Deployment Guide - SharePoint Link Analyzer

**Last Updated:** December 18, 2025  
**Target Environment:** Ubuntu 22.04 LTS on DigitalOcean, AWS, Linode, etc.  
**Security Level:** Production-ready with hardening

---

## Table of Contents

1. [Server Setup](#server-setup)
2. [Node.js & Application](#nodejs--application)
3. [Nginx Reverse Proxy](#nginx-reverse-proxy)
4. [SSL/TLS with Let's Encrypt](#ssltls-with-lets-encrypt)
5. [Process Management](#process-management)
6. [Firewall Configuration](#firewall-configuration)
7. [Security Hardening](#security-hardening)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)

---

## Server Setup

### Initial VPS Configuration

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git build-essential

# Create app user (non-root)
sudo useradd -m -s /bin/bash sharepoint
sudo usermod -aG sudo sharepoint

# Set up directories
sudo mkdir -p /var/www/sharepoint-analyzer
sudo chown -R sharepoint:sharepoint /var/www/sharepoint-analyzer
```

### SSH Hardening (Optional but Recommended)

```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Change these settings:
Port 2222                          # Change default SSH port
PermitRootLogin no
PasswordAuthentication no           # Use SSH keys only
X11Forwarding no
MaxAuthTries 3
MaxSessions 10
ClientAliveInterval 300
ClientAliveCountInterval 2

# Restart SSH
sudo systemctl restart ssh
```

---

## Node.js & Application

### Install Node.js LTS (v20)

```bash
# Switch to app user
sudo su - sharepoint

# Install Node Version Manager (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install Node.js LTS
nvm install 20
nvm use 20
node --version  # Should be v20.x.x
```

### Deploy Application

```bash
# Clone repository (or copy files)
cd /var/www/sharepoint-analyzer
git clone https://github.com/yourusername/sharepoint-link-analyzer.git .
# OR if using SFTP/SCP:
# scp -r -P 2222 ./sharepoint-analyzer/* sharepoint@your-vps:/var/www/sharepoint-analyzer/

# Install dependencies
npm install --production

# Run first-run setup (generates .env)
node scripts/setup.js

# Follow the prompts:
# - Enter JWT_SECRET (auto-generated)
# - Enter admin password
# - Enter domain (e.g., https://sharing-links.yourdomain.com)
```

### Environment Variables

The setup script creates `.env` automatically. Verify it contains:

```bash
# View the .env file (DON'T commit this!)
cat .env

# Should show:
# NODE_ENV=production
# JWT_SECRET=<random-string>
# ADMIN_PASSWORD_HASH=<bcrypt-hash>
# ALLOWED_ORIGINS=https://sharing-links.yourdomain.com
```

---

## Nginx Reverse Proxy

### Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### Configure Nginx

Create config file:

```bash
sudo nano /etc/nginx/sites-available/sharepoint-analyzer
```

Paste this configuration:

```nginx
# Rate limiting zone (DDOS protection)
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;

upstream sharepoint_app {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name sharing-links.yourdomain.com;
    
    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name sharing-links.yourdomain.com;
    
    # SSL certificates (configured later with Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/sharing-links.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sharing-links.yourdomain.com/privkey.pem;
    
    # SSL configuration (strong security)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    
    # Logging
    access_log /var/log/nginx/sharepoint-access.log;
    error_log /var/log/nginx/sharepoint-error.log;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css text/javascript application/json;
    gzip_min_length 1000;
    
    # Client body size limit
    client_max_body_size 10m;
    
    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    
    # Proxy settings
    location / {
        # Rate limiting
        limit_req zone=general burst=20 nodelay;
        
        proxy_pass http://sharepoint_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Stricter rate limit for login endpoint
    location /api/admin/login {
        limit_req zone=login burst=5 nodelay;
        
        proxy_pass http://sharepoint_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Deny access to sensitive files
    location ~ /\.env {
        deny all;
    }
    
    location ~ /node_modules {
        deny all;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/sharepoint-analyzer /etc/nginx/sites-enabled/
sudo nginx -t  # Test config
sudo systemctl restart nginx
```

---

## SSL/TLS with Let's Encrypt

### Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Generate SSL Certificate

```bash
# Replace with your domain
sudo certbot certonly --nginx \
    -d sharing-links.yourdomain.com \
    --email your-email@example.com \
    --agree-tos \
    --no-eff-email
```

### Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Enable auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Check status
sudo systemctl status certbot.timer
```

---

## Process Management

### Install PM2

```bash
# Install globally
sudo npm install -g pm2

# Setup PM2 to run as sharepoint user
sudo -u sharepoint pm2 startup systemd -u sharepoint --hp /home/sharepoint

# Start application
cd /var/www/sharepoint-analyzer
pm2 start api/server.js --name "sharepoint-analyzer" --env production

# Save PM2 config
pm2 save

# Verify
pm2 status
pm2 logs sharepoint-analyzer
```

### PM2 Ecosystem File (Optional)

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'sharepoint-analyzer',
    script: './api/server.js',
    instances: 'max',  // Use all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_memory_restart: '500M',
    merge_logs: true,
    autorestart: true,
    watch: false  // Don't watch in production
  }]
};
```

Then start with:

```bash
pm2 start ecosystem.config.js
```

---

## Firewall Configuration

### UFW (Uncomplicated Firewall)

```bash
# Enable firewall
sudo ufw enable

# Allow SSH (IMPORTANT - do this first!)
sudo ufw allow 2222/tcp  # Or your custom SSH port

# Allow HTTP & HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Deny everything else
sudo ufw default deny incoming
sudo ufw default allow outgoing

# View status
sudo ufw status
```

### iptables (Optional, Advanced)

For additional DDoS protection:

```bash
sudo apt install -y fail2ban

# Configure fail2ban
sudo nano /etc/fail2ban/jail.local
```

Add:

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 2222  # Your SSH port
```

Restart:

```bash
sudo systemctl restart fail2ban
```

---

## Security Hardening

### 1. Disable Root Login

```bash
sudo passwd -l root
```

### 2. Set Up Automatic Security Updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 3. Configure Fail2Ban for Nginx

```bash
sudo nano /etc/fail2ban/jail.local
```

Add:

```ini
[nginx-http-auth]
enabled = true

[nginx-noscript]
enabled = true

[nginx-badbots]
enabled = true

[nginx-noproxy]
enabled = true

[nginx-limit-req]
enabled = true
```

### 4. Regular Backup

```bash
# Create backup script
cat > ~/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/sharepoint-analyzer"
mkdir -p $BACKUP_DIR

# Backup .env (encrypted)
tar -czf $BACKUP_DIR/env-$(date +%Y%m%d).tar.gz /var/www/sharepoint-analyzer/.env

# Backup analytics data
cp /var/www/sharepoint-analyzer/api/data/analytics.json $BACKUP_DIR/analytics-$(date +%Y%m%d).json

# Keep only last 30 days
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup complete: $BACKUP_DIR"
EOF

chmod +x ~/backup.sh

# Schedule daily backup (crontab)
crontab -e
# Add: 0 2 * * * /home/sharepoint/backup.sh
```

---

## Monitoring & Maintenance

### 1. Set Up Monitoring

```bash
# Install monit for process monitoring
sudo apt install -y monit

# Configure monit
sudo nano /etc/monit/monitrc
```

Add:

```
check process sharepoint with pidfile /var/run/pm2.pid
    start program = "/usr/local/bin/pm2 start all"
    stop program = "/usr/local/bin/pm2 stop all"
    if failed host 127.0.0.1 port 3000 then restart
```

### 2. Log Rotation

```bash
# Configure logrotate
sudo nano /etc/logrotate.d/sharepoint-analyzer
```

Add:

```
/var/www/sharepoint-analyzer/logs/*.log
/var/log/nginx/sharepoint-*.log
{
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 sharepoint sharepoint
    sharedscripts
    postrotate
        systemctl reload nginx > /dev/null 2>&1 || true
        pm2 reloadLogs > /dev/null 2>&1 || true
    endscript
}
```

### 3. Health Check Endpoint

```bash
# Monitor with curl
curl -s https://sharing-links.yourdomain.com/ | head -20

# Check specific endpoints
curl -s https://sharing-links.yourdomain.com/api/csrf-token
```

### 4. Regular Updates

```bash
# Check for updates monthly
sudo apt update
sudo apt upgrade -y

# Update Node.js packages
cd /var/www/sharepoint-analyzer
npm audit
npm audit fix

# Update PM2
sudo npm install -g pm2@latest
pm2 update
```

---

## Troubleshooting

### Application won't start

```bash
# Check logs
pm2 logs sharepoint-analyzer

# Check port 3000
sudo lsof -i :3000

# Manual start
cd /var/www/sharepoint-analyzer
NODE_ENV=production node api/server.js
```

### Nginx issues

```bash
# Test config
sudo nginx -t

# View logs
sudo tail -f /var/log/nginx/sharepoint-error.log
sudo tail -f /var/log/nginx/sharepoint-access.log
```

### SSL certificate issues

```bash
# Check cert validity
sudo certbot certificates

# Renew manually
sudo certbot renew --force-renewal
```

### Permission issues

```bash
# Fix permissions
sudo chown -R sharepoint:sharepoint /var/www/sharepoint-analyzer
sudo chmod -R 755 /var/www/sharepoint-analyzer
sudo chmod 600 /var/www/sharepoint-analyzer/.env
```

### Out of memory

```bash
# Check memory usage
free -h

# Increase swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## Post-Deployment Checklist

- [ ] SSH port changed and firewall configured
- [ ] SSL certificate installed and auto-renewal enabled
- [ ] Application running via PM2
- [ ] Nginx reverse proxy working
- [ ] Admin panel accessible at `/admin/`
- [ ] Backup script created and tested
- [ ] Log rotation configured
- [ ] Monitoring set up
- [ ] Security headers verified (check with https://securityheaders.com)
- [ ] HTTPS redirect working
- [ ] Rate limiting functioning (test with multiple requests)
- [ ] .env file permissions set to 600
- [ ] Regular update schedule planned

---

## Security Checklist

- [ ] Only SSH key authentication enabled
- [ ] Root login disabled
- [ ] Firewall configured (ufw)
- [ ] Fail2Ban enabled for brute-force protection
- [ ] HTTPS/TLS enforced
- [ ] Security headers configured in Nginx
- [ ] CSP headers set in app
- [ ] CSRF protection enabled
- [ ] Rate limiting active
- [ ] File upload validation in place
- [ ] Admin password is strong (20+ chars recommended)
- [ ] JWT_SECRET is random and strong
- [ ] Data backups encrypted and stored safely
- [ ] Unattended security updates enabled

---

## Support & Questions

For security issues, see [SECURITY_AUDIT.md](../SECURITY_AUDIT.md)  
For application issues, check logs with `pm2 logs sharepoint-analyzer`

---

**Last Review:** December 18, 2025  
**Next Review:** June 18, 2026
