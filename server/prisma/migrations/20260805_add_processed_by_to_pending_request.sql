-- Add processedById to PendingRequest to track which admin processed the request
ALTER TABLE "PendingRequest" ADD COLUMN IF NOT EXISTS "processedById" INTEGER;

-- Add foreign key constraint to AdminUser(id) and set to NULL on delete
ALTER TABLE "PendingRequest"
  ADD CONSTRAINT IF NOT EXISTS "PendingRequest_processedById_fkey"
  FOREIGN KEY ("processedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL;

-- Optional: index for faster lookups
CREATE INDEX IF NOT EXISTS "idx_pendingrequest_processedbyid" ON "PendingRequest" ("processedById");
