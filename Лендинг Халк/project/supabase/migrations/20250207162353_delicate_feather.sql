/*
  # Update scooter pricing and rental periods

  1. New Features
    - Add purchase calculator function
    - Add rental period constraints
    - Update pricing for all models

  2. Changes
    - Add min/max rental periods for each pricing type
    - Update pricing history with new constraints
*/

-- Create purchase calculator function
CREATE OR REPLACE FUNCTION calculate_purchase_plan(
  model_id uuid,
  initial_payment numeric,
  months integer
) RETURNS TABLE (
  total_price numeric,
  monthly_payment numeric,
  total_payment numeric,
  savings numeric
) AS $$
DECLARE
  model_price numeric;
  daily_rate numeric;
BEGIN
  -- Get model base price and daily rate
  SELECT 
    m.base_price, 
    ph.price 
  INTO model_price, daily_rate
  FROM scooter_models m
  JOIN scooter_pricing_history ph ON ph.model_id = m.id
  WHERE m.id = model_id
    AND ph.pricing_type = 'daily'
    AND ph.effective_from <= now()
    AND (ph.effective_to IS NULL OR ph.effective_to > now());

  -- Calculate payments
  RETURN QUERY
  SELECT
    model_price as total_price,
    (model_price - initial_payment) / months as monthly_payment,
    model_price as total_payment,
    (daily_rate * months * 30) - model_price as savings;
END;
$$ LANGUAGE plpgsql;

-- Add rental period constraints
ALTER TABLE scooter_pricing_history
ADD COLUMN min_period integer,
ADD COLUMN max_period integer;

-- Update minimum rental periods for existing records
UPDATE scooter_pricing_history
SET 
  min_period = CASE 
    WHEN pricing_type = 'daily' THEN 3
    WHEN pricing_type = 'weekly' THEN 7
    WHEN pricing_type = 'monthly' THEN 30
    WHEN pricing_type = 'purchase' THEN 90
  END,
  max_period = CASE
    WHEN pricing_type = 'daily' THEN 6
    WHEN pricing_type = 'weekly' THEN 29
    WHEN pricing_type = 'monthly' THEN 365
    WHEN pricing_type = 'purchase' THEN 365
  END
WHERE effective_to IS NULL;

-- Update Honda Dio pricing
UPDATE scooter_pricing_history
SET effective_to = now()
WHERE model_id = (SELECT id FROM scooter_models WHERE model_code = 'HDIO2024')
  AND effective_to IS NULL;

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
  unnest(ARRAY['daily', 'weekly', 'monthly', 'purchase']) as pricing_type,
  unnest(ARRAY[800, 500, 400, 850]) as price,
  now() as effective_from,
  unnest(ARRAY[3, 7, 30, 90]) as min_period,
  unnest(ARRAY[6, 29, 365, 365]) as max_period
FROM scooter_models
WHERE model_code = 'HDIO2024';

-- Update Yamaha Jog pricing
UPDATE scooter_pricing_history
SET effective_to = now()
WHERE model_id = (SELECT id FROM scooter_models WHERE model_code = 'YJOG2024')
  AND effective_to IS NULL;

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
  unnest(ARRAY['daily', 'weekly', 'monthly', 'purchase']) as pricing_type,
  unnest(ARRAY[1000, 600, 500, 950]) as price,
  now() as effective_from,
  unnest(ARRAY[3, 7, 30, 90]) as min_period,
  unnest(ARRAY[6, 29, 365, 365]) as max_period
FROM scooter_models
WHERE model_code = 'YJOG2024';

-- Update Yamaha Gear pricing
UPDATE scooter_pricing_history
SET effective_to = now()
WHERE model_id = (SELECT id FROM scooter_models WHERE model_code = 'YGEAR2024')
  AND effective_to IS NULL;

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
  unnest(ARRAY['daily', 'weekly', 'monthly', 'purchase']) as pricing_type,
  unnest(ARRAY[1200, 700, 600, 1050]) as price,
  now() as effective_from,
  unnest(ARRAY[3, 7, 30, 90]) as min_period,
  unnest(ARRAY[6, 29, 365, 365]) as max_period
FROM scooter_models
WHERE model_code = 'YGEAR2024';