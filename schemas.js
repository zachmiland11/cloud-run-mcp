// In lib/schemas.js (new file)
import { z } from "zod";

export const ProjectSchema = z.object({
  id: z.string().describe("The unique ID of the GCP project"),
  name: z.string().optional().describe("The user-friendly name of the GCP project"),
  // Add other relevant project properties
}).describe("Google Cloud Project");

export const CloudRunServiceSchema = z.object({
  name: z.string().describe("The name of the Cloud Run service"),
  uri: z.string().url().describe("The URL of the deployed service"),
  region: z.string().describe("The region where the service is deployed"),
  project: z.string().describe("The GCP project ID where the service resides"),
  lastModifier: z.string().optional().describe("The identity of the last user to modify the service"),
  // Add other relevant service properties (e.g., status, traffic)
}).describe("Google Cloud Run Service");

// Define schemas for Jobs and Worker Pools similarly
// export const CloudBuildJobSchema = ...
// export const WorkerPoolSchema = ...