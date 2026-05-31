-- v0.6: новый исход дела-должника — «Имущество возвращено» (closed_recovered).
-- Применяется когда угнанный/невозвращённый скутер вернулся: дело закрывается
-- без денег (не оплата, не списание). Идемпотентно через IF NOT EXISTS.
ALTER TYPE debtor_stage ADD VALUE IF NOT EXISTS 'closed_recovered';
