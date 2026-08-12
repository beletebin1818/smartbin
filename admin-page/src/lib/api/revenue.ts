export * from './revenueClient';
import revenueClient from './revenueClient';

// Compatibility shim — re-export the real implementation from revenueClient.
// This file is intentionally a minimal forwarder so older imports continue
// to work while ensuring there is no mock data or duplicate logic here.

export default revenueClient;
