-- FacHub: Offers table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS offers (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name   TEXT NOT NULL,
  proposed_price NUMERIC(10,4) NOT NULL DEFAULT 0,
  notes          TEXT,
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON offers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
