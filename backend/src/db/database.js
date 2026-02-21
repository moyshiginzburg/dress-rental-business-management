/**
 * Database Connection Module
 * 
 * Purpose: Manage SQLite database connection using better-sqlite3.
 * Provides a singleton database instance for the entire application.
 * 
 * Operation: Creates and exports a single database connection that
 * can be imported anywhere in the backend.
 */

import Database from 'better-sqlite3';
import { dbConfig } from '../config/index.js';
import { dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';

// Ensure the data directory exists
const dbDir = dirname(dbConfig.path);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
  console.log(`Created database directory: ${dbDir}`);
}

// Create database connection
let db;

try {
  db = new Database(dbConfig.path);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  
  console.log(`Database connected: ${dbConfig.path}`);
} catch (error) {
  console.error('Failed to connect to database:', error);
  throw error;
}

// Helper function to run a query with parameters
export function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

// Helper function to get one row
export function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

// Helper function to get all rows
export function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

// Helper function for transactions
export function transaction(fn) {
  return db.transaction(fn)();
}

// Close database connection (for graceful shutdown)
export function close() {
  if (db) {
    db.close();
    console.log('Database connection closed');
  }
}

// Export the database instance for direct access if needed
export default db;
