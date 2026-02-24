/**
 * Database Schema Definition
 * 
 * Purpose: Define the SQLite database schema for the business management system.
 * Contains all table creation SQL statements and provides functions to initialize
 * the database structure.
 * 
 * Operation: This module exports SQL statements that can be executed to create
 * the database tables. It's used by the migration script.
 */

// Users table - for admin authentication
export const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'admin' CHECK(role IN ('admin', 'user')),
    is_active INTEGER DEFAULT 1,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

// Customers table - client information
export const createCustomersTable = `
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    source TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

// Create index for customer search
export const createCustomerIndexes = `
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
`;

// Dresses table - dress inventory
export const createDressesTable = `
CREATE TABLE IF NOT EXISTS dresses (
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
`;

// Create index for dress search
export const createDressIndexes = `
CREATE INDEX IF NOT EXISTS idx_dresses_name ON dresses(name);
CREATE INDEX IF NOT EXISTS idx_dresses_status ON dresses(status);
`;

// Dress history - tracks each rental/sale/sewing event for a dress
export const createDressHistoryTable = `
CREATE TABLE IF NOT EXISTS dress_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dress_id INTEGER NOT NULL,
    customer_id INTEGER,
    customer_name TEXT,
    wearer_name TEXT,
    amount REAL NOT NULL,
    rental_type TEXT DEFAULT 'rental' CHECK(rental_type IN ('rental', 'sewing_for_rental', 'sewing', 'sale')),
    event_date DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    order_id INTEGER REFERENCES orders(id),
    FOREIGN KEY (dress_id) REFERENCES dresses(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);
`;

// Transactions table - income and expenses
export const createTransactionsTable = `
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    category TEXT NOT NULL,
    customer_id INTEGER,
    customer_name TEXT,
    supplier TEXT,
    product TEXT,
    amount REAL NOT NULL,
    payment_method TEXT,
    receipt_url TEXT,
    notes TEXT,
    order_id INTEGER,
    customer_charge_amount REAL DEFAULT 0,
    confirmation_number TEXT,
    last_four_digits TEXT,
    check_number TEXT,
    bank_details TEXT,
    installments INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);
`;

// Create indexes for transactions (date/type/category for list filtering,
// customer_id/order_id for JOINs and correlated subqueries)
export const createTransactionIndexes = `
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(order_id);
`;

// Orders table - rentals, sewing orders, sales
export const createOrdersTable = `
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    event_date DATE,
    total_price REAL NOT NULL,
    deposit_amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'cancelled')),
    agreement_signed INTEGER DEFAULT 0,
    local_signature_path TEXT,
    notes TEXT,
    order_summary TEXT,
    local_agreement_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);
`;

// Order items table - multiple dresses/items per order
export const createOrderItemsTable = `
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    dress_id INTEGER,
    dress_name TEXT NOT NULL,
    wearer_name TEXT,
    item_type TEXT DEFAULT 'rental' CHECK(item_type IN ('rental', 'sewing', 'sewing_for_rental', 'sale')),
    base_price REAL DEFAULT 0,
    additional_payments REAL DEFAULT 0,
    final_price REAL DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (dress_id) REFERENCES dresses(id) ON DELETE SET NULL
);
`;

// Create indexes for order items (order_id for cascade lookups, dress_id for
// availability checks, composite dress+type for sale status sync)
export const createOrderItemsIndexes = `
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_dress_id ON order_items(dress_id);
CREATE INDEX IF NOT EXISTS idx_order_items_dress_type ON order_items(dress_id, item_type);
`;

// Create indexes for orders
export const createOrderIndexes = `
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_event_date ON orders(event_date);
CREATE INDEX IF NOT EXISTS idx_orders_status_event_date ON orders(status, event_date);
`;

// Agreements table - digital agreements for orders (rental, sewing, sale, etc.)
export const createAgreementsTable = `
CREATE TABLE IF NOT EXISTS agreements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    customer_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_email TEXT,
    event_date DATE,
    signature_data TEXT,
    signature_url TEXT,
    pdf_url TEXT,
    agreed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);
`;

// Settings table - for system configuration
export const createSettingsTable = `
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

// Create indexes for dress_history (dress_id for history, customer_id for
// customer detail pages, order_id for order-linked history)
export const createDressHistoryIndexes = `
CREATE INDEX IF NOT EXISTS idx_dress_history_dress_id ON dress_history(dress_id);
CREATE INDEX IF NOT EXISTS idx_dress_history_customer_id ON dress_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_dress_history_order_id ON dress_history(order_id);
`;

// Create indexes for agreements (order_id for agreement status checks,
// customer_id for customer detail pages)
export const createAgreementsIndexes = `
CREATE INDEX IF NOT EXISTS idx_agreements_order_id ON agreements(order_id);
CREATE INDEX IF NOT EXISTS idx_agreements_customer_id ON agreements(customer_id);
`;

// All schema items in order
export const allSchemaItems = [
    { name: 'users', sql: createUsersTable },
    { name: 'customers', sql: createCustomersTable },
    { name: 'customers_indexes', sql: createCustomerIndexes },
    { name: 'dresses', sql: createDressesTable },
    { name: 'dresses_indexes', sql: createDressIndexes },
    { name: 'dress_history', sql: createDressHistoryTable },
    { name: 'dress_history_indexes', sql: createDressHistoryIndexes },
    { name: 'transactions', sql: createTransactionsTable },
    { name: 'transactions_indexes', sql: createTransactionIndexes },
    { name: 'orders', sql: createOrdersTable },
    { name: 'orders_indexes', sql: createOrderIndexes },
    { name: 'order_items', sql: createOrderItemsTable },
    { name: 'order_items_indexes', sql: createOrderItemsIndexes },
    { name: 'agreements', sql: createAgreementsTable },
    { name: 'agreements_indexes', sql: createAgreementsIndexes },
    { name: 'settings', sql: createSettingsTable },
];

export default allSchemaItems;
