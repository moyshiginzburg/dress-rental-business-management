/**
 * Update Admin User Script
 * 
 * Purpose: Update email and/or password for an existing admin user.
 * Allows changing login credentials for the management system.
 * 
 * Usage: npm run update-admin
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
console.log('║            Update Admin User                                ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

async function updateAdmin() {
  try {
    // List existing admin users
    const admins = db.prepare('SELECT id, email, name, created_at FROM users WHERE role = ?').all('admin');
    
    if (admins.length === 0) {
      console.log('❌ No admin users found in the system.');
      console.log('   Run "npm run create-admin" to create one.');
      rl.close();
      db.close();
      return;
    }
    
    console.log('Existing admin users:');
    console.log('');
    admins.forEach((admin, index) => {
      console.log(`  ${index + 1}. ${admin.email} (${admin.name})`);
    });
    console.log('');
    
    // Select user to update
    let selectedAdmin = admins[0];
    if (admins.length > 1) {
      const selection = await question(`Select user to update (1-${admins.length}): `);
      const idx = parseInt(selection, 10) - 1;
      if (idx < 0 || idx >= admins.length) {
        throw new Error('Invalid selection');
      }
      selectedAdmin = admins[idx];
    } else {
      console.log(`Updating: ${selectedAdmin.email}`);
    }
    
    console.log('');
    console.log('Enter new values (press Enter to keep existing):');
    console.log('');
    
    // Get new email
    const newEmail = await question(`New email [${selectedAdmin.email}]: `);
    const emailToUse = newEmail.trim() || selectedAdmin.email;
    
    // Validate email format
    if (!emailToUse.includes('@')) {
      throw new Error('Invalid email format');
    }
    
    // Check if new email already exists (if changed)
    if (emailToUse.toLowerCase() !== selectedAdmin.email.toLowerCase()) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(
        emailToUse.toLowerCase(), 
        selectedAdmin.id
      );
      if (existing) {
        throw new Error('Another user with this email already exists');
      }
    }
    
    // Get new password
    const newPassword = await question('New password (min 8 chars, blank to keep): ');
    
    // Get new name
    const newName = await question(`New display name [${selectedAdmin.name}]: `);
    const nameToUse = newName.trim() || selectedAdmin.name;
    
    // Confirm changes
    console.log('');
    console.log('Changes to apply:');
    console.log(`  Email: ${selectedAdmin.email} → ${emailToUse}`);
    console.log(`  Name: ${selectedAdmin.name} → ${nameToUse}`);
    console.log(`  Password: ${newPassword ? '(will be changed)' : '(unchanged)'}`);
    console.log('');
    
    const confirm = await question('Apply changes? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      rl.close();
      db.close();
      return;
    }
    
    // Apply updates
    console.log('\nUpdating user...');
    
    if (newPassword && newPassword.length > 0) {
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }
      
      // Update with new password
      const passwordHash = await bcrypt.hash(newPassword, 10);
      db.prepare(
        'UPDATE users SET email = ?, name = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(emailToUse.toLowerCase(), nameToUse, passwordHash, selectedAdmin.id);
    } else {
      // Update without password change
      db.prepare(
        'UPDATE users SET email = ?, name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(emailToUse.toLowerCase(), nameToUse, selectedAdmin.id);
    }
    
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('✅ Admin user updated successfully!');
    console.log(`   Email: ${emailToUse}`);
    console.log(`   Name: ${nameToUse}`);
    console.log(`   Password: ${newPassword ? 'Changed' : 'Unchanged'}`);
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log('You can now login with the new credentials.');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    db.close();
  }
}

updateAdmin();
