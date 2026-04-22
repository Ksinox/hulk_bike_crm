-- Update base prices for scooter models
UPDATE scooter_models
SET base_price = 100000
WHERE model_code = 'HDIO2024';

UPDATE scooter_models
SET base_price = 150000
WHERE model_code = 'YJOG2024';

UPDATE scooter_models
SET base_price = 190000
WHERE model_code = 'YGEAR2024';