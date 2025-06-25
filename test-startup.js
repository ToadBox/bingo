#!/usr/bin/env node

/**
 * Test script to verify startup configuration checks
 * Run this in a clean directory to test the startup checks
 */

const path = require('path');
const fs = require('fs');

// Mock the logger for testing
const mockLogger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || ''),
  warn: (msg, data) => console.log(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.log(`[ERROR] ${msg}`, data || '')
};

// Mock the logger module
const originalRequire = require;
require = function(id) {
  if (id === './logger') {
    return mockLogger;
  }
  return originalRequire.apply(this, arguments);
};

async function testStartupChecks() {
  console.log('Testing startup configuration checks...\n');
  
  try {
    // Import the startup checks
    const startupChecks = require('./src/private/utils/startupChecks');
    
    // Run the checks
    await startupChecks.runChecks();
    
    console.log('\n✅ Startup checks completed successfully!');
    
    // Verify files were created
    const configYmlExists = fs.existsSync('config.yml');
    const envExists = fs.existsSync('.env');
    
    console.log('\n📁 Files created:');
    console.log(`  config.yml: ${configYmlExists ? '✅' : '❌'}`);
    console.log(`  .env: ${envExists ? '✅' : '❌'}`);
    
    if (configYmlExists) {
      const configContent = fs.readFileSync('config.yml', 'utf8');
      console.log('\n📄 config.yml content preview:');
      console.log(configContent.substring(0, 200) + '...');
    }
    
    if (envExists) {
      const envContent = fs.readFileSync('.env', 'utf8');
      console.log('\n📄 .env content preview:');
      console.log(envContent.substring(0, 200) + '...');
    }
    
    // Check directories
    const directories = [
      'src/data',
      'src/private/boards',
      'src/private/utils/logs',
      'src/public/images/cells',
      'uploads/images'
    ];
    
    console.log('\n📁 Directories created:');
    directories.forEach(dir => {
      const exists = fs.existsSync(dir);
      console.log(`  ${dir}: ${exists ? '✅' : '❌'}`);
    });
    
  } catch (error) {
    console.error('\n❌ Startup checks failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testStartupChecks(); 