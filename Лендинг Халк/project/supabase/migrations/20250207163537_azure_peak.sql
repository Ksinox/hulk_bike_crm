/*
  # Fix purchase calculator function

  1. Changes
    - Drop existing function
    - Create new function with proper parameter handling
    - Add validation checks with correct RAISE EXCEPTION syntax
    - Improve calculation logic
*/

-- Drop existing function first
DROP FUNCTION IF EXISTS calculate_purchase_plan(uuid, numeric, integer);

-- Create new function
CREATE FUNCTION calculate_purchase_plan(
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
  v_model_price numeric;
  v_daily_rate numeric;
  v_min_initial_payment numeric;
BEGIN
  -- Get model base price and daily rate
  SELECT 
    sm.base_price,
    COALESCE(
      (SELECT ph.price 
       FROM scooter_pricing_history ph 
       WHERE ph.model_id = sm.id 
         AND ph.pricing_type = 'daily'
         AND ph.effective_to IS NULL
       LIMIT 1
      ), 0
    )
  INTO v_model_price, v_daily_rate
  FROM scooter_models sm
  WHERE sm.id = model_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Model not found';
  END IF;

  -- Calculate minimum initial payment (10% of model price)
  v_min_initial_payment := v_model_price * 0.1;

  -- Validate input parameters
  IF initial_payment < v_min_initial_payment THEN
    RAISE EXCEPTION 'Initial payment must be at least 10%% of model price (%.2f)', v_min_initial_payment;
  END IF;

  IF initial_payment >= v_model_price THEN
    RAISE EXCEPTION 'Initial payment cannot be greater than or equal to model price';
  END IF;

  IF months < 3 OR months > 12 THEN
    RAISE EXCEPTION 'Payment period must be between 3 and 12 months';
  END IF;

  -- Calculate payments
  RETURN QUERY
  SELECT
    v_model_price as total_price,
    ROUND((v_model_price - initial_payment) / months, 2) as monthly_payment,
    v_model_price as total_payment,
    ROUND(v_daily_rate * months * 30 - v_model_price, 2) as savings;
END;
$$ LANGUAGE plpgsql;