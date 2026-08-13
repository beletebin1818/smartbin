-- Add processedById (admin) to PendingRequest
ALTER TABLE "PendingRequest" ADD COLUMN IF NOT EXISTS "processedById" INTEGER;

ALTER TABLE "PendingRequest"
  ADD CONSTRAINT IF NOT EXISTS "PendingRequest_processedById_fkey"
  FOREIGN KEY ("processedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_pendingrequest_processedbyid" ON "PendingRequest" ("processedById");

-- Add processedByAgentId (agent) to PendingRequest
ALTER TABLE "PendingRequest" ADD COLUMN IF NOT EXISTS "processedByAgentId" INTEGER;

ALTER TABLE "PendingRequest"
  ADD CONSTRAINT IF NOT EXISTS "PendingRequest_processedByAgentId_fkey"
  FOREIGN KEY ("processedByAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_pendingrequest_processedbyagentid" ON "PendingRequest" ("processedByAgentId");
