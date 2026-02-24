/**
 * Migration: Remove non-relevant dress fields from dresses table.
 *
 * Removes:
 * - cost
 * - sewn_date
 * - created_at (dress entry date)
 *
 * Usage: node src/db/remove-dress-cost-and-entry-date-columns.js
 */

import db from './database.js';

const removableColumns = ['cost', 'sewn_date', 'created_at'];

console.log('Running migration: remove cost/sewn_date/created_at from dresses table...');

try {
  const tableInfo = db.pragma('table_info(dresses)');
  const existingColumns = new Set(tableInfo.map((col) => col.name));

  if (tableInfo.length === 0) {
    console.log('ℹ️ dresses table does not exist. Nothing to migrate.');
  } else {
    const foundColumns = removableColumns.filter((col) => existingColumns.has(col));

    if (foundColumns.length === 0) {
      console.log('ℹ️ dresses table already has the updated schema.');
    } else {
      const basePriceExpr = existingColumns.has('base_price') ? 'COALESCE(base_price, 0)' : '0';
      const totalIncomeExpr = existingColumns.has('total_income') ? 'COALESCE(total_income, 0)' : '0';
      const rentalCountExpr = existingColumns.has('rental_count') ? 'COALESCE(rental_count, 0)' : '0';
      const statusExpr = existingColumns.has('status')
        ? "CASE WHEN status IN ('available', 'sold', 'retired') THEN status ELSE 'available' END"
        : "'available'";
      const intendedUseExpr = existingColumns.has('intended_use')
        ? "CASE WHEN intended_use IN ('rental', 'sale') THEN intended_use ELSE 'rental' END"
        : "'rental'";
      const photoUrlExpr = existingColumns.has('photo_url') ? 'photo_url' : 'NULL';
      const thumbnailUrlExpr = existingColumns.has('thumbnail_url') ? 'thumbnail_url' : 'NULL';
      const notesExpr = existingColumns.has('notes') ? 'notes' : 'NULL';
      const isActiveExpr = existingColumns.has('is_active') ? 'COALESCE(is_active, 1)' : '1';
      const updatedAtExpr = existingColumns.has('updated_at')
        ? 'COALESCE(updated_at, CURRENT_TIMESTAMP)'
        : 'CURRENT_TIMESTAMP';

      db.pragma('foreign_keys = OFF');
      db.exec('BEGIN');

      try {
        db.exec(`
          CREATE TABLE dresses_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            base_price REAL DEFAULT 0,
            total_income REAL DEFAULT 0,
            rental_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'available' CHECK(status IN ('available', 'sold', 'retired')),
            intended_use TEXT DEFAULT 'rental' CHECK(intended_use IN ('rental', 'sale')),
            photo_url TEXT,
            thumbnail_url TEXT,
            notes TEXT,
            is_active INTEGER DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        db.exec(`
          INSERT INTO dresses_new (
            id,
            name,
            base_price,
            total_income,
            rental_count,
            status,
            intended_use,
            photo_url,
            thumbnail_url,
            notes,
            is_active,
            updated_at
          )
          SELECT
            id,
            name,
            ${basePriceExpr},
            ${totalIncomeExpr},
            ${rentalCountExpr},
            ${statusExpr},
            ${intendedUseExpr},
            ${photoUrlExpr},
            ${thumbnailUrlExpr},
            ${notesExpr},
            ${isActiveExpr},
            ${updatedAtExpr}
          FROM dresses;
        `);

        db.exec('DROP TABLE dresses');
        db.exec('ALTER TABLE dresses_new RENAME TO dresses');
        db.exec('CREATE INDEX IF NOT EXISTS idx_dresses_name ON dresses(name)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_dresses_status ON dresses(status)');

        db.exec('COMMIT');
        console.log(`✅ Removed columns from dresses table: ${foundColumns.join(', ')}`);
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        db.pragma('foreign_keys = ON');
      }
    }
  }

  console.log('Migration completed successfully');
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
