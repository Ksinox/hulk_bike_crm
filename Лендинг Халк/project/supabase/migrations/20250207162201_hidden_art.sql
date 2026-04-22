/*
  # Insert initial scooter data

  1. Data Insertion
    - Insert base scooter models (Honda Dio, Yamaha Jog, Yamaha Gear)
    - Insert pricing history for each model
    - Set initial pricing for all rental types

  2. Notes
    - All prices are in RUB
    - Pricing is effective immediately
    - No end date for current pricing
*/

-- Insert scooter models
INSERT INTO scooter_models (name, model_code, specs, base_price) VALUES
(
  'Honda Dio',
  'HDIO2024',
  '{
    "engine": "2-тактный",
    "cooling": "Воздушная",
    "maxSpeed": 50,
    "fuelTank": 4.4,
    "seats": 1,
    "weight": 83,
    "engineVolume": 49,
    "length": 1675,
    "width": 645,
    "height": 1035,
    "wheelbase": 1160,
    "tires": {
      "front": "90/90-10 41j",
      "rear": "90/90-10 41j"
    }
  }'::jsonb,
  85000
),
(
  'Yamaha Jog',
  'YJOG2024',
  '{
    "engine": "4-тактный",
    "cooling": "Жидкостная",
    "maxSpeed": 64,
    "fuelTank": 4.4,
    "seats": 1,
    "weight": 83,
    "engineVolume": 49,
    "length": 1685,
    "width": 645,
    "height": 1035,
    "wheelbase": 1160,
    "tires": {
      "front": "90/90-10 41j",
      "rear": "90/90-10 41j"
    }
  }'::jsonb,
  95000
),
(
  'Yamaha Gear',
  'YGEAR2024',
  '{
    "engine": "4-тактный",
    "cooling": "Жидкостная",
    "maxSpeed": 64,
    "fuelTank": 7.5,
    "seats": 1,
    "weight": 98,
    "engineVolume": 49,
    "length": 1850,
    "width": 680,
    "height": 1025,
    "wheelbase": 1280,
    "tires": {
      "front": "90/90-12 44J",
      "rear": "110/90-10 51J"
    }
  }'::jsonb,
  105000
);

-- Insert pricing history for Honda Dio
WITH model AS (SELECT id FROM scooter_models WHERE model_code = 'HDIO2024')
INSERT INTO scooter_pricing_history (model_id, pricing_type, price, effective_from) VALUES
((SELECT id FROM model), 'daily', 800, now()),
((SELECT id FROM model), 'weekly', 500, now()),
((SELECT id FROM model), 'monthly', 400, now()),
((SELECT id FROM model), 'purchase', 850, now());

-- Insert pricing history for Yamaha Jog
WITH model AS (SELECT id FROM scooter_models WHERE model_code = 'YJOG2024')
INSERT INTO scooter_pricing_history (model_id, pricing_type, price, effective_from) VALUES
((SELECT id FROM model), 'daily', 1000, now()),
((SELECT id FROM model), 'weekly', 600, now()),
((SELECT id FROM model), 'monthly', 500, now()),
((SELECT id FROM model), 'purchase', 950, now());

-- Insert pricing history for Yamaha Gear
WITH model AS (SELECT id FROM scooter_models WHERE model_code = 'YGEAR2024')
INSERT INTO scooter_pricing_history (model_id, pricing_type, price, effective_from) VALUES
((SELECT id FROM model), 'daily', 1200, now()),
((SELECT id FROM model), 'weekly', 700, now()),
((SELECT id FROM model), 'monthly', 600, now()),
((SELECT id FROM model), 'purchase', 1050, now());