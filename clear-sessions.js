#!/usr/bin/env node
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Path to the database
const dbPath = path.join(__dirname, 'src', 'data', 'bingo.sqlite');

console.log('Clearing all active sessions from database...');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  
  // Clear all sessions
  db.run('DELETE FROM sessions', [], function(err) {
    if (err) {
      console.error('Error clearing sessions:', err.message);
    } else {
      console.log(`Cleared ${this.changes} session(s)`);
    }
    
    // Clear any anonymous users
    db.run('DELETE FROM users WHERE auth_provider = "anonymous"', [], function(err) {
      if (err) {
        console.error('Error clearing anonymous users:', err.message);
      } else {
        console.log(`Cleared ${this.changes} anonymous user(s)`);
      }
      
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('Database connection closed.');
          console.log('All sessions cleared. Restart the server to test fresh authentication.');
        }
      });
    });
  });
}); 