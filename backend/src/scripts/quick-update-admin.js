/**
 * Quick Update Admin Script
 * 
 * Purpose: Quick non-interactive update of admin credentials.
 * Accepts command line arguments for email and password.
 * 
 * Usage: node src/scripts/quick-update-admin.js <new-email> <new-password>
 */

import bcrypt from 'bcryptjs';
import db from '../db/database.js';

const newEmail = process.argv[2];
const newPassword = process.argv[3];

if (!newEmail || !newPassword) {
  console.error('Usage: node src/scripts/quick-update-admin.js <new-email> <new-password>');
  console.error('Example: node src/scripts/quick-update-admin.js user@example.com MyNewPassword123');
  process.exit(1);
}

if (!newEmail.includes('@')) {
  console.error('Error: Invalid email format');
  process.exit(1);
}

if (newPassword.length < 8) {
  console.error('Error: Password must be at least 8 characters');
  process.exit(1);
}

async function updateAdmin() {
  try {
    // Find existing admin
    const admin = db.prepare('SELECT id, email, name FROM users WHERE role = ?').get('admin');
    
    if (!admin) {
      console.error('Error: No admin user found');
      process.exit(1);
    }
    
    console.log('');
    console.log(`Updating admin: ${admin.email} → ${newEmail}`);
    
    // Hash password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Update user
    db.prepare(
      'UPDATE users SET email = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(newEmail.toLowerCase(), passwordHash, admin.id);
    
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('✅ Admin updated successfully!');
    console.log(`   Email: ${newEmail}`);
    console.log(`   Password: (updated)`);
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

updateAdmin();
