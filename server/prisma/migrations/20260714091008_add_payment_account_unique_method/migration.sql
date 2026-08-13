-- Add unique constraint on method column of PaymentAccount table
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAccount_method_key" ON "PaymentAccount"("method");
