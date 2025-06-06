const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// Rate limiting for login attempts to prevent brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per IP per 15 minutes
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count successful logins against the rate limit
  keyGenerator: (req) => {
    // Use both IP and a forwarded IP if available (for proxied requests)
    return req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  }
});

// Helper to create a hash of the password (more secure than plain comparison)
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  // Use a more secure algorithm (sha256) with more iterations
  const iterations = 10000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256').toString('hex');
  return { hash, salt, iterations };
}

// Verify password against a hash
function verifyPassword(password, storedHash, storedSalt, iterations = 10000) {
  try {
    // For the first deployment, we might not have a hash yet
    if (!storedHash || !storedSalt) {
      // Direct comparison with environment variable password (legacy)
      const sitePassword = process.env.SITE_PASSWORD || 'toadbox';
      return password === sitePassword;
    }
    
    // Generate hash with the same salt and iterations
    const hash = crypto.pbkdf2Sync(password, storedSalt, iterations, 64, 'sha256').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
  } catch (error) {
    logger.error('Password verification error', { error: error.message });
    return false;
  }
}

// Keep a hash of the site password for more secure comparison
let passwordData = null;

// Initialize the password hash on startup
function initializePassword() {
  const sitePassword = process.env.SITE_PASSWORD || 'meme';
  passwordData = hashPassword(sitePassword);
  logger.info('Password hash initialized');
}

// Initialize on module load
initializePassword();

// Login route
router.post('/login', loginLimiter, (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  try {
    // Verify the password using the hashed version
    const isValid = verifyPassword(
      password, 
      passwordData?.hash, 
      passwordData?.salt,
      passwordData?.iterations
    );
    
    if (!isValid) {
      logger.warn('Failed login attempt', { ip: req.ip });
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate a secure token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set the token as a cookie
    res.cookie('auth_token', token, {
      httpOnly: true, // Cookie not accessible via JavaScript
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict', // Prevent CSRF
      path: '/' // Apply to all routes
    });

    logger.info('Successful login', { ip: req.ip });
    res.json({ success: true });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({ error: 'An error occurred during login' });
  }
});

// Logout route
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', { path: '/' });
  res.json({ success: true });
});

module.exports = router; 