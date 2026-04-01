-- FacHub Seed Data
-- Run this AFTER schema.sql in your Supabase SQL Editor

-- Sample Products
INSERT INTO products (id, name, category, type, purchase_cost_kg, base_margin) VALUES
  ('11111111-1111-1111-1111-111111111101', 'Colla Epossidica Bicomponente', 'glues', 'Epossidica', 4.50, 35.00),
  ('11111111-1111-1111-1111-111111111102', 'Colla Poliuretanica PU400', 'glues', 'Poliuretanica', 3.20, 40.00),
  ('11111111-1111-1111-1111-111111111103', 'Colla Cianoacrilica CA200', 'glues', 'Cianoacrilica', 8.90, 50.00),
  ('11111111-1111-1111-1111-111111111104', 'Disco Abrasivo Zirconio 80G', 'abrasives', 'Disco', 2.10, 45.00),
  ('11111111-1111-1111-1111-111111111105', 'Carta Abrasiva Ossido Alluminio 120G', 'abrasives', 'Carta', 1.40, 38.00)
ON CONFLICT (id) DO NOTHING;

-- Sample Customers
INSERT INTO customers (id, company_name, sector, description, email, phone, offer_status) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Falegnameria Rossi SRL', 'glues', 'Falegnameria artigianale, specializzata in mobili su misura', 'info@falegnameria-rossi.it', '+39 02 1234567', 'ongoing'),
  ('22222222-2222-2222-2222-222222222202', 'Metalmeccanica Bianchi SpA', 'abrasives', 'Lavorazione metalli e carpenteria industriale', 'acquisti@bianchi-spa.it', '+39 011 9876543', 'pending'),
  ('22222222-2222-2222-2222-222222222203', 'Carrozzeria Verdi', 'abrasives', 'Carrozzeria auto e veicoli industriali', 'carrozzeria.verdi@email.com', '+39 055 4445556', 'expired')
ON CONFLICT (id) DO NOTHING;

-- Sample Orders for Falegnameria Rossi (recent)
INSERT INTO orders (id, customer_id, date, notes) VALUES
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', CURRENT_DATE - INTERVAL '10 days', 'Ordine urgente, consegna entro fine settimana'),
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222201', CURRENT_DATE - INTERVAL '45 days', 'Ordine standard mensile')
ON CONFLICT (id) DO NOTHING;

-- Sample Orders for Metalmeccanica Bianchi (older - should appear in "not ordered in 60 days")
INSERT INTO orders (id, customer_id, date, notes) VALUES
  ('33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222202', CURRENT_DATE - INTERVAL '75 days', 'Primo ordine di prova')
ON CONFLICT (id) DO NOTHING;

-- Order lines for order 1
INSERT INTO order_lines (order_id, product_id, product_name, quantity, sale_price, purchase_price) VALUES
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111101', 'Colla Epossidica Bicomponente', 25.000, 7.50, 4.50),
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111102', 'Colla Poliuretanica PU400', 15.000, 5.20, 3.20);

-- Order lines for order 2
INSERT INTO order_lines (order_id, product_id, product_name, quantity, sale_price, purchase_price) VALUES
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111101', 'Colla Epossidica Bicomponente', 30.000, 7.20, 4.50),
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111103', 'Colla Cianoacrilica CA200', 5.000, 14.00, 8.90);

-- Order lines for order 3
INSERT INTO order_lines (order_id, product_id, product_name, quantity, sale_price, purchase_price) VALUES
  ('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111104', 'Disco Abrasivo Zirconio 80G', 50.000, 3.80, 2.10),
  ('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111105', 'Carta Abrasiva Ossido Alluminio 120G', 100.000, 2.20, 1.40);

-- Sample Notes
INSERT INTO customer_notes (customer_id, text, created_at) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Il sig. Rossi preferisce essere contattato il mattino. Interessato a nuovi prodotti epossidici.', NOW() - INTERVAL '5 days'),
  ('22222222-2222-2222-2222-222222222201', 'Ha richiesto campioni della nuova linea PU500.', NOW() - INTERVAL '2 days'),
  ('22222222-2222-2222-2222-222222222202', 'Azienda in fase di espansione, potrebbero aumentare i volumi nel Q2.', NOW() - INTERVAL '15 days'),
  ('22222222-2222-2222-2222-222222222203', 'Offerta scaduta, da ricontattare per rinnovo contratto annuale.', NOW() - INTERVAL '3 days');
