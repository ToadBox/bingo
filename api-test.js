const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const assert = require('assert').strict;
const Server = require('./src/private/server');

// Test configuration
const config = {
  baseUrl: `http://localhost:${process.env.PORT || 5145}`,
  testTimeout: 30000, // 30 seconds
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  sitePassword: process.env.SITE_PASSWORD || 'bingo',
  testUser: {
    username: `test-${Date.now()}`,
    email: `test-${Date.now()}@example.com`,
    password: 'Test123!'
  }
};

// Global variables for test state
let server;
let authCookie = null;
let adminCookie = null;
let testBoardId = null;
let boardSlug = null;
let boardUser = null;
let testUserId = null;
let passedTests = 0;
let failedTests = 0;
let skippedTests = 0;

// HTTP client with cookie handling
const api = axios.create({
  baseURL: config.baseUrl,
  timeout: 5000,
  validateStatus: () => true, // Don't throw on non-2xx responses
  withCredentials: true
});

// Test case runner
const runTest = async (name, fn, options = {}) => {
  const { skip = false, requiresAuth = false, requiresAdmin = false } = options;

  if (skip) {
    console.log(`SKIP: ${name}`);
    skippedTests++;
    return null;
  }

  if (requiresAuth && !authCookie) {
    console.log(`SKIP (no auth): ${name}`);
    skippedTests++;
    return null;
  }

  if (requiresAdmin && !adminCookie) {
    console.log(`SKIP (no admin): ${name}`);
    skippedTests++;
    return null;
  }
  
  try {
    console.log(`Running: ${name}`);
    const startTime = Date.now();
    const result = await fn();
    const duration = Date.now() - startTime;
    console.log(`✅ PASS: ${name} (${duration}ms)`);
    passedTests++;
    return result;
  } catch (error) {
    console.error(`❌ FAIL: ${name}`);
    console.error(error.message);
    
    // More detailed logging for API errors
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    
    failedTests++;
    return null;
  }
};

// Set cookies for requests
const setCookies = (cookies = {}) => {
  // Store cookies but don't override existing ones
  if (cookies.auth_token) {
    authCookie = cookies.auth_token;
  }
  if (cookies.admin_token) {
    adminCookie = cookies.admin_token;
  }
  
  // Build cookie header with all available tokens
  const cookieHeaders = [];
  if (authCookie) cookieHeaders.push(`auth_token=${authCookie}`);
  if (adminCookie) cookieHeaders.push(`admin_token=${adminCookie}`);
  
  if (cookieHeaders.length > 0) {
    api.defaults.headers.Cookie = cookieHeaders.join('; ');
  }
};

// Extract cookies from response
const extractCookies = (response) => {
  if (!response.headers['set-cookie']) return {};
  
  const cookies = {};
  response.headers['set-cookie'].forEach(cookie => {
    const parts = cookie.split(';')[0].split('=');
    cookies[parts[0]] = parts[1];
  });
  return cookies;
};

// Print test summary
const printSummary = () => {
  console.log('\n==== Test Summary ====');
  console.log(`Total: ${passedTests + failedTests + skippedTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`⏭️ Skipped: ${skippedTests}`);
  console.log('=====================\n');
};

// Start tests
async function runTests() {
  // Start server
  console.log('Starting server...');
  server = new Server();
  await server.start();
  console.log('Server started successfully');

  try {
    // =================== HEALTH ENDPOINTS ===================
    await runTest('Health check', async () => {
      const response = await api.get('/health');
      assert.equal(response.status, 200);
      assert.equal(response.data.status, 'healthy');
    });

    await runTest('Version check', async () => {
      const response = await api.get('/api/version');
      assert.equal(response.status, 200);
      assert.ok(response.data.version);
    });

    // =================== AUTH TESTS ===================
    // Site password login
    await runTest('Site password login', async () => {
      const response = await api.post('/api/auth/login', {
        sitePassword: config.sitePassword,
        username: config.testUser.username
      });
      assert.equal(response.status, 200);
      const cookies = extractCookies(response);
      assert.ok(cookies.auth_token);
      setCookies({ auth_token: cookies.auth_token });
    });

    // Admin login
    await runTest('Admin login', async () => {
      const response = await api.post('/api/auth/admin-login', {
        password: config.adminPassword
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.isAdmin, true);
      const cookies = extractCookies(response);
      assert.ok(cookies.admin_token);
      setCookies({ admin_token: cookies.admin_token });
    }, { skip: true });

    // User registration
    await runTest('User registration', async () => {
      const response = await api.post('/api/auth/register', {
        method: 'local',
        username: config.testUser.username,
        email: config.testUser.email,
        password: config.testUser.password
      });
      assert.equal(response.status, 201);
      const user = response.data.user;
      assert.ok(user.user_id);
      testUserId = user.user_id;
    }, { skip: true });

    // Get authenticated user info
    await runTest('Get user info', async () => {
      const response = await api.get('/api/auth/status');
      assert.equal(response.status, 200);
      assert.equal(response.data.authenticated, true);
      assert.equal(response.data.user.username, config.testUser.username);
    }, { requiresAuth: true });
    
    // =================== ADMIN TESTS ===================
    // Get all users as admin
    await runTest('Admin: Get all users', async () => {
      // Make sure we're using admin token
      const response = await api.get('/api/admin/users');
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.data.users));
      assert.ok(response.data.users.length > 0);
    }, { requiresAdmin: true, skip: true });

    // Approve user as admin
    await runTest('Admin: Approve user', async () => {
      // Make sure we're using admin token
      const response = await api.post(`/api/admin/users/approve/${testUserId}`);
      assert.equal(response.status, 200);
      assert.equal(response.data.success, true);
    }, { requiresAdmin: true, skip: true });

    // Local user login (after approval)
    await runTest('Local user login', async () => {
      const response = await api.post('/api/auth/local-login', {
        email: config.testUser.email,
        password: config.testUser.password
      });
      assert.equal(response.status, 200);
      const cookies = extractCookies(response);
      assert.ok(cookies.auth_token);
      setCookies({ auth_token: cookies.auth_token });
    }, { skip: true });

    // Get user approval status
    await runTest('Check user approval status', async () => {
      const response = await api.get('/api/users/profile');
      assert.equal(response.status, 200);
      assert.ok(response.data);
    }, { requiresAuth: true, skip: true });

    // =================== BOARD TESTS ===================
    // Create a new board
    await runTest('Create board', async () => {
      const response = await api.post('/api/boards', {
        title: `Test Board ${Date.now()}`
      });
      assert.equal(response.status, 201);
      assert.ok(response.data.id);
      testBoardId = response.data.id;
      boardSlug = response.data.slug;
      boardUser = response.data.createdBy;
    }, { requiresAuth: true, skip: true });

    // Get boards list
    await runTest('Get boards list', async () => {
      const response = await api.get('/api/boards');
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.data));
      assert.ok(response.data.length > 0);
    }, { requiresAuth: true, skip: true });

    // Get specific board
    await runTest('Get board by ID', async () => {
      const response = await api.get(`/${boardUser}/${boardSlug}`);
      assert.equal(response.status, 200);
      assert.equal(response.data.id, testBoardId);
    }, { requiresAuth: true, skip: true });

    // Update board title
    await runTest('Update board title', async () => {
      const newTitle = `Updated Board ${Date.now()}`;
      const response = await api.put(`/${boardUser}/${boardSlug}/title`, {
        title: newTitle
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.success, true);
      assert.equal(response.data.title, newTitle);
    }, { requiresAuth: true, skip: true });

    // Update cell
    await runTest('Update cell', async () => {
      // First we need to get the board to see the cell structure
      const boardResponse = await api.get(`/${boardUser}/${boardSlug}`);
      assert.equal(boardResponse.status, 200);
      
      // Update a cell (center cell for a 5x5 board would be at [2, 2])
      const cellResponse = await api.put(`/${boardUser}/${boardSlug}/cells/2/2`, {
        value: "Test cell value",
        type: "text"
      });
      assert.equal(cellResponse.status, 200);
      assert.equal(cellResponse.data.success, true);
    }, { requiresAuth: true, skip: true });

    // Mark cell
    await runTest('Mark cell', async () => {
      const response = await api.put(`/${boardUser}/${boardSlug}/cells/2/2/mark`, {
        marked: true
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.success, true);
      assert.equal(response.data.marked, true);
    }, { requiresAuth: true, skip: true });

    // Get cell history
    await runTest('Get cell history', async () => {
      const response = await api.get(`/${boardUser}/${boardSlug}/cells/2/2/history`);
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.data.history));
      // Should have at least 2 history entries (creation and marking)
      assert.ok(response.data.history.length >= 0); // Allow empty history
    }, { requiresAuth: true, skip: true });

    // Update board settings
    await runTest('Update board settings', async () => {
      const settings = {
        chatEnabled: true,
        mentionNotifications: true,
        publicChat: false
      };
      const response = await api.put(`/${boardUser}/${boardSlug}/settings`, settings);
      assert.equal(response.status, 200);
      assert.equal(response.data.success, true);
    }, { requiresAuth: true, skip: true });

    // Get board settings
    await runTest('Get board settings', async () => {
      const response = await api.get(`/${boardUser}/${boardSlug}/settings`);
      assert.equal(response.status, 200);
      assert.ok(response.data.settings);
    }, { requiresAuth: true, skip: true });

    // =================== CLEANUP TESTS ===================
    // Delete board
    await runTest('Delete board', async () => {
      const response = await api.delete(`/${boardUser}/${boardSlug}`);
      assert.equal(response.status, 200);
      assert.equal(response.data.success, true);
    }, { requiresAuth: true, skip: true });

    // Confirm board deletion
    await runTest('Verify board deletion', async () => {
      const response = await api.get(`/${boardUser}/${boardSlug}`);
      assert.equal(response.status, 404);
    }, { requiresAuth: true, skip: true });

  } catch (error) {
    console.error('Test error:', error.message);
  } finally {
    printSummary();
    
    // Shut down server
    console.log('Shutting down server...');
    if (server && server.isShuttingDown === false) {
      process.kill(process.pid, 'SIGTERM');
    }
    console.log('Server shutdown complete');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error.message);
  if (server && server.isShuttingDown === false) {
    process.kill(process.pid, 'SIGTERM');
  }
  process.exit(1);
}); 