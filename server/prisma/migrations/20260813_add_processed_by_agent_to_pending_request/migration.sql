-- Add processedById (admin) to PendingRequest
ALTER TABLE "PendingRequest" ADD COLUMN IF NOT EXISTS "processedById" INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PendingRequest_processedById_fkey'
      AND table_name = 'PendingRequest'
  ) THEN
    ALTER TABLE "PendingRequest"
      ADD CONSTRAINT "PendingRequest_processedById_fkey"
      FOREIGN KEY ("processedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_pendingrequest_processedbyid" ON "PendingRequest" ("processedById");

-- Add processedByAgentId (agent) to PendingRequest
ALTER TABLE "PendingRequest" ADD COLUMN IF NOT EXISTS "processedByAgentId" INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PendingRequest_processedByAgentId_fkey'
      AND table_name = 'PendingRequest'
  ) THEN
    ALTER TABLE "PendingRequest"
      ADD CONSTRAINT "PendingRequest_processedByAgentId_fkey"
      FOREIGN KEY ("processedByAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_pendingrequest_processedbyagentid" ON "PendingRequest" ("processedByAgentId");
