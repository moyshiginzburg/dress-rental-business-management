# Database Schema – business.db (SQLite)

> Auto-generated docs — keep in sync with every schema change.
> Last updated: 2026-02-19

---

## Foreign-Key Map (quick reference)

| Child Table | FK Column | → Parent Table | On Delete |
|---|---|---|---|
| orders | customer_id | customers | NO ACTION |
| order_items | order_id | orders | CASCADE |
| order_items | dress_id | dresses | SET NULL |
| dress_history | dress_id | dresses | NO ACTION |
| dress_history | customer_id | customers | NO ACTION |
| dress_history | order_id | orders | NO ACTION |
| transactions | customer_id | customers | NO ACTION |
| transactions | order_id | orders | NO ACTION |
| agreements | order_id | orders | NO ACTION |
| agreements | customer_id | customers | NO ACTION |

---

## Table Structures

### 1. customers

| Column | Type | Nullable | Default | PK | Notes |
|---|---|---|---|---|---|
| id | INTEGER | NO | AUTOINCREMENT | PK | |
| name | TEXT | NO | — | | |
| phone | TEXT | YES | NULL | | |
| email | TEXT | YES | NULL | | |
| source | TEXT | YES | NULL | | Free text – how the customer found the business |
| notes | TEXT | YES | NULL | | |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP | | |

**Indexes:** `idx_customers_name(name)`, `idx_customers_phone(phone)`, `idx_customers_email(email)`

---

### 2. dresses

| Column | Type | Nullable | Default | PK | Notes |
|---|---|---|---|---|---|
| id | INTEGER | NO | AUTOINCREMENT | PK | |
| name | TEXT | NO | — | | |
| base_price | REAL | YES | 0 | | |
| total_income | REAL | YES | 0 | | Sum of all rental/sale income |
| rental_count | INTEGER | YES | 0 | | Count of rental/sale transactions |
| status | TEXT | YES | 'available' | | CHECK: `available`, `rented`, `sold`, `retired` |
| intended_use | TEXT | YES | 'rental' | | CHECK: `rental`, `sale` |
| photo_url | TEXT | YES | NULL | | |
| thumbnail_url | TEXT | YES | NULL | | |
| notes | TEXT | YES | NULL | | |
| is_active | INTEGER | YES | 1 | | 1=active, 0=hidden |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP | | |

**Indexes:** `idx_dresses_name(name)`, `idx_dresses_status(status)`

---

### 3. orders

| Column | Type | Nullable | Default | PK | Notes |
|---|---|---|---|---|---|
| id | INTEGER | NO | AUTOINCREMENT | PK | |
| customer_id | INTEGER | NO | — | | FK → customers |
| event_date | DATE | YES | NULL | | |
| total_price | REAL | NO | — | | |
| deposit_amount | REAL | YES | 0 | | |
| paid_amount | REAL | YES | 0 | | |
| status | TEXT | YES | 'active' | | CHECK: `active`, `cancelled` |
| agreement_signed | INTEGER | YES | 0 | | 1=signed |
| local_signature_path | TEXT | YES | NULL | | Path to signature image file |
| notes | TEXT | YES | NULL | | |
| order_summary | TEXT | YES | NULL | | Auto-generated text summary of items |
| local_agreement_path | TEXT | YES | NULL | | Path to agreement PDF |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP | | |

**Indexes:** `idx_orders_customer_id`, `idx_orders_status`, `idx_orders_event_date`, `idx_orders_status_event_date`

---

### 4. order_items

| Column | Type | Nullable | Default | PK | Notes |
|---|---|---|---|---|---|
| id | INTEGER | NO | AUTOINCREMENT | PK | |
| order_id | INTEGER | NO | — | | FK → orders (CASCADE) |
| dress_id | INTEGER | YES | NULL | | FK → dresses (SET NULL) |
| dress_name | TEXT | NO | — | | |
| wearer_name | TEXT | YES | NULL | | |
| item_type | TEXT | YES | 'rental' | | CHECK: `rental`, `sewing`, `sewing_for_rental`, `sale` |
| base_price | REAL | YES | 0 | | |
| additional_payments | REAL | YES | 0 | | |
| final_price | REAL | YES | 0 | | |
| notes | TEXT | YES | NULL | | Item-level notes |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP | | |

**Indexes:** `idx_order_items_order_id`, `idx_order_items_dress_id`, `idx_order_items_dress_type(dress_id, item_type)`

---

### 5. dress_history

| Column | Type | Nullable | Default | PK | Notes |
|---|---|---|---|---|---|
| id | INTEGER | NO | AUTOINCREMENT | PK | |
| dress_id | INTEGER | NO | — | | FK → dresses |
| customer_id | INTEGER | YES | NULL | | FK → customers |
| customer_name | TEXT | YES | NULL | | Account holder name (from linked order) |
| wearer_name | TEXT | YES | NULL | | Name of the person who wore/used the dress |
| amount | REAL | NO | — | | |
| rental_type | TEXT | YES | 'rental' | | CHECK: `rental`, `sewing_for_rental`, `sewing`, `sale` |
| event_date | DATE | YES | NULL | | |
| notes | TEXT | YES | NULL | | |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | |
| order_id | INTEGER | YES | NULL | | FK → orders |

**Indexes:** `idx_dress_history_dress_id`, `idx_dress_history_customer_id`, `idx_dress_history_order_id`

---

### 6. transactions

| Column | Type | Nullable | Default | PK | Notes |
|---|---|---|---|---|---|
| id | INTEGER | NO | AUTOINCREMENT | PK | |
| date | DATE | NO | — | | |
| type | TEXT | NO | — | | CHECK: `income`, `expense` |
| category | TEXT | NO | — | | Income: 'order', 'repair', 'other'; Expense: 'materials', 'overhead', 'tax', 'equipment', 'salary', 'other' |
| customer_id | INTEGER | YES | NULL | | FK → customers |
| customer_name | TEXT | YES | NULL | | |
| supplier | TEXT | YES | NULL | | For expenses |
| product | TEXT | YES | NULL | | For expenses |
| amount | REAL | NO | — | | |
| payment_method | TEXT | YES | NULL | | English values: cash, credit, bit, transfer, check, paybox, other |
| receipt_url | TEXT | YES | NULL | | |
| notes | TEXT | YES | NULL | | |
| order_id | INTEGER | YES | NULL | | FK → orders |
| customer_charge_amount | REAL | YES | 0 | | Amount charged to customer (for expenses) |
| confirmation_number | TEXT | YES | NULL | | Payment confirmation number |
| last_four_digits | TEXT | YES | NULL | | Credit card last 4 |
| check_number | TEXT | YES | NULL | | Check number |
| bank_details | TEXT | YES | NULL | | JSON string with bank info |
| installments | INTEGER | YES | 1 | | Number of installments |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP | | |

**Indexes:** `idx_transactions_date`, `idx_transactions_type`, `idx_transactions_category`, `idx_transactions_customer_id`, `idx_transactions_order_id`

---

### 7. agreements

| Column | Type | Nullable | Default | PK | Notes |
|---|---|---|---|---|---|
| id | INTEGER | NO | AUTOINCREMENT | PK | |
| order_id | INTEGER | YES | NULL | | FK → orders |
| customer_id | INTEGER | NO | — | | FK → customers |
| customer_name | TEXT | NO | — | | |
| customer_phone | TEXT | YES | NULL | | |
| customer_email | TEXT | YES | NULL | | |
| event_date | DATE | YES | NULL | | |
| signature_data | TEXT | YES | NULL | | Base64 encoded signature image |
| signature_url | TEXT | YES | NULL | | Path to saved signature file |
| pdf_url | TEXT | YES | NULL | | Path to saved PDF |
| agreed_at | DATETIME | NO | CURRENT_TIMESTAMP | | |
| ip_address | TEXT | YES | NULL | | Client IP at signing |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | |

**Indexes:** `idx_agreements_order_id`, `idx_agreements_customer_id`

---

### 8. settings

| Column | Type | Nullable | Default | PK | Notes |
|---|---|---|---|---|---|
| id | INTEGER | NO | AUTOINCREMENT | PK | |
| key | TEXT | NO | — | | UNIQUE |
| value | TEXT | YES | NULL | | |
| description | TEXT | YES | NULL | | |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP | | |

**Current keys:** `business_name`, `business_phone`, `business_email`

---

### 9. users

| Column | Type | Nullable | Default | PK | Notes |
|---|---|---|---|---|---|
| id | INTEGER | NO | AUTOINCREMENT | PK | |
| email | TEXT | NO | — | | UNIQUE |
| password_hash | TEXT | NO | — | | |
| name | TEXT | NO | — | | |
| role | TEXT | YES | 'admin' | | CHECK: `admin`, `user` |
| is_active | INTEGER | YES | 1 | | |
| last_login | DATETIME | YES | NULL | | |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | | |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP | | |

---

## Column Purpose (Short Descriptions)

### customers
- `id` — Auto-increment primary key
- `name` — Customer full name
- `phone` — Phone number (normalized format)
- `email` — Email address
- `source` — Free text: how the customer found the business (Google, Facebook, referral name, etc.)
- `notes` — Free text notes about the customer
- `created_at` — Record creation timestamp
- `updated_at` — Last update timestamp

### dresses
- `id` — Auto-increment primary key
- `name` — Dress display name / identifier
- `base_price` — Default rental price
- `total_income` — Cumulative income from all rentals/sales
- `rental_count` — Number of times rented/sold
- `status` — Current availability: available / rented / sold / retired
- `intended_use` — Primary purpose: rental or sale
- `photo_url` — Full-size photo URL
- `thumbnail_url` — Thumbnail photo URL
- `notes` — Internal notes
- `is_active` — Soft delete flag (1=visible, 0=hidden)
- `updated_at` — Last update timestamp

### orders
- `id` — Auto-increment primary key
- `customer_id` — FK to the ordering customer
- `event_date` — Date of the customer's event
- `total_price` — Total order price (sum of all items)
- `deposit_amount` — Initial deposit collected
- `paid_amount` — Total amount paid so far
- `status` — Order state: active / cancelled
- `agreement_signed` — Whether digital agreement was signed (0/1)
- `local_signature_path` — Path to the signature image file
- `notes` — Order notes
- `order_summary` — Auto-generated text summary of items in the order
- `local_agreement_path` — Local file path to agreement PDF
- `created_at` — Order creation timestamp
- `updated_at` — Last update timestamp (used for agreement version check)

### order_items
- `id` — Auto-increment primary key
- `order_id` — FK to parent order (cascading delete)
- `dress_id` — FK to dress from inventory (nullable for non-inventory items)
- `dress_name` — Display name of the dress/item
- `wearer_name` — Name of the person wearing the dress
- `item_type` — Type: rental / sewing / sewing_for_rental / sale
- `base_price` — Base price for this item
- `additional_payments` — Extra charges (alterations, accessories)
- `final_price` — Total price (base + additional)
- `notes` — Notes specific to this item
- `created_at` — Record creation timestamp
- `updated_at` — Last update timestamp

### dress_history
- `id` — Auto-increment primary key
- `dress_id` — FK to dress
- `customer_id` — FK to customer
- `customer_name` — Account holder name (auto-populated from linked order's customer)
- `wearer_name` — Name of the person who wore/used the dress
- `amount` — Transaction amount
- `rental_type` — Type: rental / sewing_for_rental / sewing / sale
- `event_date` — Event date
- `notes` — Notes
- `created_at` — Record creation timestamp
- `order_id` — FK to order (if linked)

### transactions
- `id` — Auto-increment primary key
- `date` — Transaction date
- `type` — income or expense
- `category` — Income: 'order' / 'repair' / 'other'; Expense: 'materials' / 'overhead' / 'tax' / 'equipment' / 'salary' / 'other'
- `customer_id` — FK to customer (for income)
- `customer_name` — Customer name snapshot
- `supplier` — Supplier name (for expenses)
- `product` — Product description (for expenses)
- `amount` — Transaction amount
- `payment_method` — Payment method: cash, credit, bit, transfer, check, paybox, other
- `receipt_url` — Receipt file URL
- `notes` — Transaction notes
- `order_id` — FK to order (links payment to specific order)
- `customer_charge_amount` — Amount charged to customer (for customer-charged expenses)
- `confirmation_number` — Payment confirmation/reference number
- `last_four_digits` — Last 4 digits of credit card
- `check_number` — Check number
- `bank_details` — JSON string with bank transfer details
- `installments` — Number of installments
- `created_at` — Record creation timestamp
- `updated_at` — Last update timestamp

### agreements
- `id` — Auto-increment primary key
- `order_id` — FK to order (multiple agreements per order allowed)
- `customer_id` — FK to customer
- `customer_name` — Customer name at time of signing
- `customer_phone` — Phone at time of signing
- `customer_email` — Email at time of signing
- `event_date` — Event date at time of signing
- `signature_data` — Base64 encoded signature image data
- `signature_url` — Path to saved signature image file
- `pdf_url` — Path to saved agreement PDF
- `agreed_at` — Signing timestamp
- `ip_address` — Client IP address at signing
- `created_at` — Record creation timestamp

### settings
- `id` — Auto-increment primary key
- `key` — Setting key (unique)
- `value` — Setting value
- `description` — Human-readable description
- `updated_at` — Last update timestamp

### users
- `id` — Auto-increment primary key
- `email` — Login email (unique)
- `password_hash` — Bcrypt password hash
- `name` — Display name
- `role` — User role: admin or user
- `is_active` — Account active flag
- `last_login` — Last login timestamp
- `created_at` — Account creation timestamp
- `updated_at` — Last update timestamp

---

## Dropped Tables / Columns (Migration 2026-02-17)

### Dropped Tables
- **payments** — Empty, unused. Order payments tracked via `transactions.order_id`.

### Renamed Tables
- **rental_agreements** → **agreements** — Now covers all agreement types (rental, sewing, sale).

### Dropped Columns
- `customers.address` — Not used in UI
- `customers.id_number` — Not needed
- `customers.is_active` — Customers are never "deactivated"
- `orders.dress_id` — Replaced by order_items
- `orders.order_type` — Replaced by per-item item_type in order_items
- `orders.pickup_date` — Not tracked; at manager's discretion
- `orders.return_date` — Not tracked
- `orders.actual_return_date` — Not tracked
- `orders.source` — Not needed on orders
- `orders.google_calendar_event_id` — Managed by Apps Script
- `orders.google_task_pickup_id` — Managed by Apps Script
- `orders.google_task_return_id` — Managed by Apps Script
- `orders.google_task_wedding_id` — Managed by Apps Script
- `transactions.dress_id` — Transactions link to orders, not individual dresses
- `agreements.customer_id_number` — ID number removed from agreements
- `agreements.customer_address` — Not needed
- `agreements.pickup_date` — Not tracked
- `agreements.return_date` — Not tracked

### Changed CHECK Constraints
- `dresses.status` — Removed `damaged` (use `retired` instead)
- `orders.status` — Changed from `pending/confirmed/in_progress/completed/cancelled` to `active/cancelled`
- `order_items.item_type` — Added CHECK: `rental/sewing/sewing_for_rental/sale` (removed `repair`)

### Data Migrations
- `first_rental` → `sewing_for_rental` in order_items and dress_rentals
- `damaged` → `retired` in dresses
- `pending/confirmed/in_progress/completed` → `active` in orders
- `לא צוין` → `other` in transactions.payment_method
- `הזמנה חדשה`/`הסכם השכרה` → NULL in customers.source (auto-set values cleared)

### Removed Settings
- `rental_deposit_percent`, `advance_payment_percent`, `late_return_fee`, `missing_hanger_fee`
