/*
  # Update scooter prices

  1. Changes
    - Update pricing for Honda Dio:
      - Daily: 800₽
      - Weekly: 400₽
      - Monthly: 300₽
    
    - Update pricing for Yamaha Jog:
      - Daily: 800₽
      - Weekly: 500₽
      - Monthly: 400₽
    
    - Update pricing for Yamaha Gear:
      - Daily: 1000₽
      - Weekly: 600₽
      - Monthly: 500₽

  2. Notes
    - Sets effective_to on old pricing records
    - Creates new pricing records with updated values
    - Maintains existing min/max period constraints
*/

-- Mark all current pricing records as inactive
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