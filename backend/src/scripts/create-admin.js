/**
 * Create Admin User Script
 * 
 * Purpose: Create the first admin user for the system.
 * Prompts for email, password, and name, then creates the user.
 * 
 * Usage: npm run create-admin
 */

import { createInterface } from 'readline';
import bcrypt from 'bcryptjs';
import db from '../db/database.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║            Create Admin User                                ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

async function createAdmin() {
  try {
    // Check if admin already exists
    const existingAdmin = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin');
    if (existingAdmin.count > 0) {
      console.log('⚠️  Admin user(s) already exist in the system.');
      const proceed = await question('Create another admin? (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('Cancelled.');
        rl.close();
        db.close();
        return;
      }
    }
    
    // Get user input
    const email = await question('Email: ');
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email address');
    }
    
    // Check if email exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existingUser) {
      throw new Error('User with this email already exists');
    }
    
    const password = await question('Password (min 8 chars): ');
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    
    const name = await question('Display Name: ');
    if (!name || !name.trim()) {
      throw new Error('Name is required');
    }
    
    // Hash password
    console.log('\nCreating user...');
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Insert user
    const result = db.prepare(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
    ).run(email.toLowerCase(), passwordHash, name.trim(), 'admin');
    
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('✅ Admin user created successfully!');
    console.log(`   Email: ${email}`);
    console.log(`   Name: ${name}`);
    console.log(`   Role: admin`);
    console.log(`   ID: ${result.lastInsertRowid}`);
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log('You can now login at: http://localhost:3000');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    db.close();
  }
}

createAdmin();
