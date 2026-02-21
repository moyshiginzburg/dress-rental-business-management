/**
 * Dress Import Script
 * 
 * Purpose: Import dresses from the CSV export of the Google Sheets inventory.
 * Parses the מלאי שמלות.csv file and populates the dresses table.
 * 
 * Operation: Reads the CSV file, parses each row, and creates dress records
 * with their rental history.
 * 
 * Usage: npm run import:dresses
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to CSV file
const csvPath = join(__dirname, '..', '..', '..', 'csv-files-from-google-sheets', 'מלאי שמלות.csv');

console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║            Importing Dresses from CSV                       ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

try {
  // Read CSV file
  console.log(`Reading file: ${csvPath}`);
  const csvContent = readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  // Skip header row
  const dataLines = lines.slice(1);
  console.log(`Found ${dataLines.length} dresses to import\n`);
  
  // Prepare statements
  const insertDress = db.prepare(`
    INSERT OR IGNORE INTO dresses (name, total_income, rental_count, notes)
    VALUES (?, ?, ?, ?)
  `);
  
  const insertRental = db.prepare(`
    INSERT INTO dress_rentals (dress_id, customer_name, amount, rental_type)
    VALUES (?, ?, ?, ?)
  `);
  
  const getDressId = db.prepare('SELECT id FROM dresses WHERE name = ?');
  
  let imported = 0;
  let skipped = 0;
  let totalRentals = 0;
  
  // Process each line
  for (const line of dataLines) {
    // Parse CSV - handle commas within fields
    const parts = line.split(',');
    
    if (parts.length < 4) {
      skipped++;
      continue;
    }
    
    const dressName = parts[0]?.trim();
    const firstIncomeStr = parts[3]?.trim();
    
    if (!dressName) {
      skipped++;
      continue;
    }
    
    // Collect all rentals from remaining columns
    // Format alternates: income, customer_name, income, customer_name, ...
    const rentals = [];
    let totalIncome = 0;
    
    // First income and customer (columns 3 and 4)
    const firstIncome = parseFloat(firstIncomeStr) || 0;
    const firstCustomer = parts[4]?.trim();
    
    if (firstIncome > 0 || firstCustomer) {
      totalIncome += firstIncome;
      rentals.push({ amount: firstIncome, customer: firstCustomer || 'לא ידוע' });
    }
    
    // Remaining rentals (starting from column 5, in pairs)
    for (let i = 5; i < parts.length; i += 2) {
      const income = parseFloat(parts[i]?.trim()) || 0;
      const customer = parts[i + 1]?.trim();
      
      if (income > 0 || customer) {
        totalIncome += income;
        if (customer) {
          rentals.push({ amount: income, customer });
        }
      }
    }
    
    // Insert dress
    try {
      insertDress.run(
        dressName,
        totalIncome,
        rentals.length,
        null
      );
      
      // Get the dress ID
      const dress = getDressId.get(dressName);
      if (dress) {
        // Insert rental records
        for (const rental of rentals) {
          if (rental.customer && rental.customer !== 'לא ידוע') {
            insertRental.run(
              dress.id,
              rental.customer,
              rental.amount,
              'rental'
            );
            totalRentals++;
          }
        }
      }
      
      imported++;
      process.stdout.write(`\rImported: ${imported} dresses, ${totalRentals} rentals`);
      
    } catch (err) {
      console.error(`\nError importing ${dressName}:`, err.message);
      skipped++;
    }
  }
  
  console.log('\n');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`✅ Import completed!`);
  console.log(`   Dresses imported: ${imported}`);
  console.log(`   Rental records: ${totalRentals}`);
  console.log(`   Skipped: ${skipped}`);
  console.log('════════════════════════════════════════════════════════════');
  
} catch (error) {
  console.error('\n❌ Import failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
