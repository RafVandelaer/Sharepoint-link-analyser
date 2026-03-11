#!/usr/bin/env node

/**
 * SharePoint Link Analyzer - First Run Setup Script
 * This script sets up the application for first use:
 * - Generates JWT_SECRET
 * - Generates admin password hash
 * - Creates .env file
 * - Validates dependencies
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const projectRoot = path.join(__dirname);
const envFilePath = path.join(projectRoot, '.env');
const envExamplePath = path.join(projectRoot, '.env.example');

console.log('\n🚀 SharePoint Link Analyzer - First Run Setup\n');
console.log('='.repeat(60));

// Check if .env already exists
if (fs.existsSync(envFilePath)) {
  console.log('✅ .env file already exists. Skipping setup.');
  console.log('\nTo reconfigure, delete .env and run this script again.\n');
  process.exit(0);
}

// Check if .env.example exists
if (!fs.existsSync(envExamplePath)) {
  console.log('❌ .env.example not found. Please ensure the project is complete.');
  process.exit(1);
}

async function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  try {
    console.log('\n1️⃣  Generating JWT_SECRET (for token signing)...');
    const jwtSecret = crypto.randomBytes(32).toString('hex');
    console.log('   ✅ JWT_SECRET generated\n');

    console.log('2️⃣  Admin Password Setup');
    const adminPassword = await askQuestion('   Enter a secure admin password (min 8 chars): ');

    if (adminPassword.length < 8) {
      console.log('   ❌ Password must be at least 8 characters');
      process.exit(1);
    }

    console.log('   ⏳ Hashing password with bcrypt (this may take a moment)...');

    // Dynamic import to avoid requiring bcrypt at module load
    let bcrypt;
    try {
      bcrypt = require('bcrypt');
    } catch (error) {
      console.log('\n   ❌ bcrypt not installed. Installing dependencies first...');
      console.log('   Run: npm install\n');
      process.exit(1);
    }

    const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
    console.log('   ✅ Password hashed securely\n');

    console.log('3️⃣  Domain Configuration');
    const domain = await askQuestion('   Enter your domain (or http://localhost:3000 for local): ');
    const origins = domain || 'http://localhost:3000';
    console.log(`   ✅ CORS origins set to: ${origins}\n`);

    console.log('4️⃣  Creating .env file...');

    const envContent = `# SharePoint Link Analyzer - Environment Configuration
# Generated on ${new Date().toISOString()}

NODE_ENV=production
PORT=3000

# JWT Secret (for token signing) - DO NOT SHARE
JWT_SECRET=${jwtSecret}

# Admin Password Hash (bcrypt) - DO NOT SHARE
ADMIN_PASSWORD_HASH=${adminPasswordHash}

# Allowed origins for CORS
ALLOWED_ORIGINS=${origins}

# Logging
LOG_LEVEL=info

# Session configuration
SESSION_MAX_AGE=3600000

# Rate limiting
RATE_LIMIT_LOGIN_MAX=5
RATE_LIMIT_ANALYTICS_MAX=100
`;

    fs.writeFileSync(envFilePath, envContent);
    console.log('   ✅ .env file created\n');

    console.log('5️⃣  Checking dependencies...');
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.log('   ❌ package.json not found');
      process.exit(1);
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const requiredDeps = [
      'express',
      'cors',
      'helmet',
      'bcrypt',
      'jsonwebtoken',
      'csurf',
      'cookie-parser',
      'joi',
      'express-rate-limit'
    ];

    const missing = requiredDeps.filter(dep => !packageJson.dependencies[dep]);

    if (missing.length > 0) {
      console.log(`   ⚠️  Missing dependencies: ${missing.join(', ')}`);
      console.log('   Run: npm install\n');
    } else {
      console.log('   ✅ All dependencies present\n');
    }

    console.log('='.repeat(60));
    console.log('\n✨ Setup complete!\n');
    console.log('📝 Next steps:');
    console.log('   1. npm install (if dependencies were missing)');
    console.log('   2. npm start (to start the server)');
    console.log('   3. Open http://localhost:3000 in your browser');
    console.log('   4. Admin panel: http://localhost:3000/admin/');
    console.log(`      Username: "admin" (or any username)`);
    console.log(`      Password: "${adminPassword.substring(0, 3)}***" (the one you entered)\n`);
    console.log('🔒 Security reminders:');
    console.log('   - Keep .env file secret (add to .gitignore)');
    console.log('   - Use strong passwords');
    console.log('   - Enable HTTPS in production (set NODE_ENV=production)');
    console.log('   - Review SECURITY_AUDIT.md for deployment guidelines\n');

    rl.close();
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    rl.close();
    process.exit(1);
  }
}

main();
