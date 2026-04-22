/*
  # Create scooter models and pricing tables

  1. New Tables
    - `scooter_models`
      - Basic scooter information
      - Specifications
      - Base pricing
    - `scooter_pricing_history`
      - Historical price tracking
      - Effective dates
      - Different pricing types (daily, weekly, monthly, purchase)

  2. Updates
    - Added proper constraints and validations
    - Added audit fields for tracking changes
    - Added RLS policies for secure access
*/

-- Create scooter_models table
CREATE TABLE IF NOT EXISTS scooter_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  model_code text NOT NULL UNIQUE,
  specs jsonb NOT NULL,
  base_price numeric(10,2) NOT NULL CHECK (base_price > 0),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create scooter_pricing_history table
CREATE TABLE IF NOT EXISTS scooter_pricing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES scooter_models(id) NOT NULL,
  pricing_type text NOT NULL CHECK (pricing_type IN ('daily', 'weekly', 'monthly', 'purchase')),
  price numeric(10,2) NOT NULL CHECK (price > 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE scooter_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE scooter_pricing_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can read scooter models"
  ON scooter_models
  FOR SELECT
  USING (true);

CREATE POLICY "Only admins can modify scooter models"
  ON scooter_models
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Anyone can read pricing history"
  ON scooter_pricing_history
  FOR SELECT
  USING (true);

CREATE POLICY "Only admins can insert pricing history"
  ON scooter_pricing_history
  FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Create function to get current pricing for a model
CREATE OR REPLACE FUNCTION get_current_pricing(model_id uuid)
RETURNS TABLE (
  pricing_type text,
  price numeric(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT ph.pricing_type, ph.price
  FROM scooter_pricing_history ph
  WHERE ph.model_id = model_id
    AND ph.effective_from <= now()
    AND (ph.effective_to IS NULL OR ph.effective_to > now())
  ORDER BY ph.effective_from DESC;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_scooter_models_updated_at
  BEFORE UPDATE ON scooter_models
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();