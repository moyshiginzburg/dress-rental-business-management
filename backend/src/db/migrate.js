/**
 * Database Migration Script
 * 
 * Purpose: Initialize the database by creating all required tables.
 * Run this script to set up a fresh database or update an existing one.
 * 
 * Operation: Iterates through all schema items and executes the SQL
 * to create tables and indexes if they don't exist.
 * 
 * Usage: npm run db:migrate
 */

import db from './database.js';
import { allSchemaItems } from './schema.js';

console.log('Starting database migration...\n');

try {
  // Run all schema creation statements
  for (const item of allSchemaItems) {
    console.log(`Creating: ${item.name}...`);
    
    // Split by semicolons for multiple statements (like indexes)
    const statements = item.sql.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        db.exec(statement);
      }
    }
    
    console.log(`  ✓ ${item.name} created`);
  }

  // Insert default settings if not exists
  const settingsExist = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  
  if (settingsExist.count === 0) {
    console.log('\nInserting default settings...');
    
    const defaultSettings = [
      { key: 'business_name', value: 'Your Business Name', description: 'Business display name' },
      { key: 'business_phone', value: 'YOUR_PHONE_NUMBER', description: 'Business phone number' },
      { key: 'business_email', value: 'your-email@example.com', description: 'Business email' },
    ];
    
    const insertSetting = db.prepare(
      'INSERT INTO settings (key, value, description) VALUES (?, ?, ?)'
    );
    
    for (const setting of defaultSettings) {
      insertSetting.run(setting.key, setting.value, setting.description);
      console.log(`  ✓ Setting: ${setting.key}`);
    }
  }

  console.log('\n✅ Database migration completed successfully!');
  console.log(`Database location: ${db.name}`);

} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
