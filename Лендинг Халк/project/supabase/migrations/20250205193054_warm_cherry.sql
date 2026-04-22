/*
  # Create scooters schema

  1. New Tables
    - `scooters`
      - `id` (uuid, primary key)
      - `name` (text)
      - `price` (integer)
      - `image` (text)
      - `specs` (jsonb)
        - engine (text)
        - cooling (text)
        - maxSpeed (integer)
        - fuelTank (numeric)
        - seats (integer)
        - weight (integer)
        - engineVolume (integer)
        - length (integer)
        - width (integer)
        - height (integer)
        - wheelbase (integer)
        - tires (jsonb)
          - front (text)
          - rear (text)
      - `available` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `scooters` table
    - Add policies for:
      - Anyone can read scooters
      - Only admins can create/update/delete scooters
*/

-- Create scooters table
CREATE TABLE IF NOT EXISTS scooters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price integer NOT NULL CHECK (price >= 0),
  image text NOT NULL,
  specs jsonb NOT NULL,
  available boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE scooters ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can read scooters"
  ON scooters
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can modify scooters"
  ON scooters
  USING (auth.jwt() ->> 'role' = 'admin');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_scooter_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_scooters_updated_at
  BEFORE UPDATE ON scooters
  FOR EACH ROW
  EXECUTE PROCEDURE update_scooter_updated_at();