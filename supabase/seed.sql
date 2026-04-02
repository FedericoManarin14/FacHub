-- FacHub Seed Data (flat order_lines schema)
-- Run AFTER schema.sql AND migration_flat_order_lines.sql

-- ── Products ───────────────────────────────────────────────
INSERT INTO products (id, name, category, type, purchase_cost_kg, base_margin) VALUES
  ('11111111-1111-1111-1111-111111111101', 'Colla Epossidica Bicomponente',        'glues',     'Epossidica',    4.50,  35.00),
  ('11111111-1111-1111-1111-111111111102', 'Colla Poliuretanica PU400',            'glues',     'Poliuretanica', 3.20,  40.00),
  ('11111111-1111-1111-1111-111111111103', 'Colla Cianoacrilica CA200',            'glues',     'Cianoacrilica', 8.90,  50.00),
  ('11111111-1111-1111-1111-111111111104', 'Disco Abrasivo Zirconio 80G',          'abrasives', 'Disco',         2.10,  45.00),
  ('11111111-1111-1111-1111-111111111105', 'Carta Abrasiva Ossido Alluminio 120G', 'abrasives', 'Carta',         1.40,  38.00)
ON CONFLICT (id) DO NOTHING;

-- ── Customers ──────────────────────────────────────────────
INSERT INTO customers (id, company_name, sector, description, email, phone, offer_status) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Falegnameria Rossi SRL',   'glues',     'Falegnameria artigianale, specializzata in mobili su misura', 'info@falegnameria-rossi.it',    '+39 02 1234567',  'ongoing'),
  ('22222222-2222-2222-2222-222222222202', 'Metalmeccanica Bianchi SpA','abrasives', 'Lavorazione metalli e carpenteria industriale',               'acquisti@bianchi-spa.it',       '+39 011 9876543', 'pending'),
  ('22222222-2222-2222-2222-222222222203', 'Carrozzeria Verdi',         'abrasives', 'Carrozzeria auto e veicoli industriali',                      'carrozzeria.verdi@email.com',   '+39 055 4445556', 'expired')
ON CONFLICT (id) DO NOTHING;

-- ── Flat order_lines ────────────────────────────────────────
-- Falegnameria Rossi — recent orders (should NOT appear in inactive list)
INSERT INTO order_lines (customer_id, product_id, product_name, date, quantity, sale_price, purchase_price, notes) VALUES
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111101','Colla Epossidica Bicomponente',  CURRENT_DATE - INTERVAL '10 days', 25, 7.50, 4.50, 'Consegna urgente'),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111102','Colla Poliuretanica PU400',      CURRENT_DATE - INTERVAL '10 days', 15, 5.20, 3.20, NULL),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111101','Colla Epossidica Bicomponente',  CURRENT_DATE - INTERVAL '45 days', 30, 7.20, 4.50, NULL),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111103','Colla Cianoacrilica CA200',      CURRENT_DATE - INTERVAL '45 days',  5,14.00, 8.90, NULL),
  -- Metalmeccanica Bianchi — old order (SHOULD appear in inactive list)
  ('22222222-2222-2222-2222-222222222202','11111111-1111-1111-1111-111111111104','Disco Abrasivo Zirconio 80G',    CURRENT_DATE - INTERVAL '75 days', 50, 3.80, 2.10, 'Primo ordine di prova'),
  ('22222222-2222-2222-2222-222222222202','11111111-1111-1111-1111-111111111105','Carta Abrasiva Ossido Alluminio 120G', CURRENT_DATE - INTERVAL '75 days',100, 2.20, 1.40, NULL);
-- Carrozzeria Verdi — no orders (should appear in inactive list)

-- ── Customer notes ─────────────────────────────────────────
INSERT INTO customer_notes (customer_id, text, created_at) VALUES
  ('22222222-2222-2222-2222-222222222201','Il sig. Rossi preferisce essere contattato il mattino. Interessato a nuovi prodotti epossidici.', NOW() - INTERVAL '5 days'),
  ('22222222-2222-2222-2222-222222222201','Ha richiesto campioni della nuova linea PU500.',                                                   NOW() - INTERVAL '2 days'),
  ('22222222-2222-2222-2222-222222222202','Azienda in fase di espansione, potrebbero aumentare i volumi nel Q2.',                             NOW() - INTERVAL '15 days'),
  ('22222222-2222-2222-2222-222222222203','Offerta rifiutata, da ricontattare per rinnovo contratto annuale.',                                 NOW() - INTERVAL '3 days');
