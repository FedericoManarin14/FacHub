-- ============================================================
-- FacHub Migration: Flat order_lines (drops orders + old order_lines)
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Drop old tables (order_lines first because it has FK to orders)
DROP TABLE IF EXISTS order_lines CASCADE;
DROP TABLE IF EXISTS orders CASCADE;

-- 2. Create new flat order_lines table
CREATE TABLE order_lines (
  id              uuid      DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id     uuid      NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id      uuid      REFERENCES products(id) ON DELETE SET NULL,
  product_name    text      NOT NULL,
  date            date      NOT NULL,
  quantity        numeric   NOT NULL,
  sale_price      numeric   NOT NULL,
  purchase_price  numeric   NOT NULL,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;

-- 4. Policy: all operations for authenticated users
CREATE POLICY "Allow all for authenticated users" ON order_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Helpful index for per-customer queries
CREATE INDEX IF NOT EXISTS order_lines_customer_id_date_idx
  ON order_lines (customer_id, date DESC);
