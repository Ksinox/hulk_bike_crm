/*
  # Update scooter models and pricing

  1. Changes
    - Update scooter models specs and base prices
    - Update pricing history with new rates
    - Remove purchase pricing type
    - Add min/max periods for each pricing type

  2. Data Updates
    - Honda Dio: Updated specs and pricing
    - Yamaha Jog: Updated specs and pricing
    - Yamaha Gear: Updated specs and pricing
*/

-- Update Honda Dio
UPDATE scooter_models
SET 
  base_price = 100000,
  specs = '{
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
  }'::jsonb
WHERE model_code = 'HDIO2024';

-- Update Yamaha Jog
UPDATE scooter_models
SET 
  base_price = 150000,
  specs = '{
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
  }'::jsonb
WHERE model_code = 'YJOG2024';

-- Update Yamaha Gear
UPDATE scooter_models
SET 
  base_price = 190000,
  specs = '{
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
  }'::jsonb
WHERE model_code = 'YGEAR2024';

-- Update pricing for all models
UPDATE scooter_pricing_history
SET effective_to = now()
WHERE effective_to IS NULL;

-- Insert new pricing for Honda Dio
WITH model AS (SELECT id FROM scooter_models WHERE model_code = 'HDIO2024')
INSERT INTO scooter_pricing_history (
  model_id,
  pricing_type,
  price,
  effective_from,
  min_period,
  max_period
)
SELECT 
  id as model_id,
  unnest(ARRAY['daily', 'weekly', 'monthly']) as pricing_type,
  unnest(ARRAY[800, 400, 300]) as price,
  now() as effective_from,
  unnest(ARRAY[1, 7, 30]) as min_period,
  unnest(ARRAY[6, 29, 365]) as max_period
FROM model;

-- Insert new pricing for Yamaha Jog
WITH model AS (SELECT id FROM scooter_models WHERE model_code = 'YJOG2024')
INSERT INTO scooter_pricing_history (
  model_id,
  pricing_type,
  price,
  effective_from,
  min_period,
  max_period
)
SELECT 
  id as model_id,
  unnest(ARRAY['daily', 'weekly', 'monthly']) as pricing_type,
  unnest(ARRAY[800, 500, 400]) as price,
  now() as effective_from,
  unnest(ARRAY[1, 7, 30]) as min_period,
  unnest(ARRAY[6, 29, 365]) as max_period
FROM model;

-- Insert new pricing for Yamaha Gear
WITH model AS (SELECT id FROM scooter_models WHERE model_code = 'YGEAR2024')
INSERT INTO scooter_pricing_history (
  model_id,
  pricing_type,
  price,
  effective_from,
  min_period,
  max_period
)
SELECT 
  id as model_id,
  unnest(ARRAY['daily', 'weekly', 'monthly']) as pricing_type,
  unnest(ARRAY[1000, 600, 500]) as price,
  now() as effective_from,
  unnest(ARRAY[1, 7, 30]) as min_period,
  unnest(ARRAY[6, 29, 365]) as max_period
FROM model;