-- Предоплаченный паркинг: фиксированный период, оплачен вперёд.
-- prepaid=true — дни/endDate закреплены при постановке (не растут), авто-закрытие
-- по окончании периода. Существующие сессии остаются открытыми (false).
ALTER TABLE "parking_sessions" ADD COLUMN "prepaid" boolean DEFAULT false NOT NULL;
