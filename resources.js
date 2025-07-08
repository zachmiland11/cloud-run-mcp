// In resources.js (new file)
import { z } from "zod";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listProjects, createProjectAndAttachBilling } from './lib/gcp-projects.js';
import { listServices, getService, getServiceLogs } from './lib/cloud-run-services.js';
// Import your newly defined schemas
import { ProjectSchema, CloudRunServiceSchema /*, CloudBuildJobSchema, WorkerPoolSchema */ } from './lib/schemas.js';

export const registerResources = (server, isRemote = false, currentProject = null, currentRegion = null) => {

  // --- GCP Projects Resource ---
  server.resource(
    "gcp.project", // Resource type ID
    new ResourceTemplate(
      "Google Cloud Project",
      "Represents a Google Cloud project.",
      ProjectSchema,
      {
        get: {
          schema: { projectId: z.string().describe("The ID of the GCP project") },
          handler: async ({ projectId }) => {
            // You'll need to implement a getProject function in lib/gcp-projects.js
            // For now, let's simulate it by filtering listProjects
            const projects = await listProjects();
            const project = projects.find(p => p.id === projectId);
            if (!project) {
              throw new Error(`Project ${projectId} not found.`);
            }
            return project;
          },
        },
        list: {
          schema: {}, // No specific parameters for listing all projects
          handler: async () => {
            if (isRemote) {
              // Remote list projects might be restricted to the current project's context,
              // or not available for security/scope reasons.
              // For now, we'll return an error or an empty array if not explicitly supported.
              throw new Error("Listing all projects is not supported in remote mode for security reasons.");
            }
            return await listProjects();
          },
        },
        create: {
          schema: {
            projectId: z.string().optional().describe("Optional. The desired ID for the new GCP project."),
          },
          handler: async ({ projectId }) => {
            if (isRemote) {
              throw new Error("Creating projects is not supported in remote mode.");
            }
            const result = await createProjectAndAttachBilling(projectId);
            // Assuming createProjectAndAttachBilling returns the new project details or ID
            return { id: projectId || result.newProjectId };
          },
        },
        // Consider adding delete, update actions if applicable
      }
    )
  );

  // --- Cloud Run Service Resource ---
  server.resource(
    "cloudrun.service", // Resource type ID
    new ResourceTemplate(
      "Cloud Run Service",
      "Represents a deployed Google Cloud Run service.",
      CloudRunServiceSchema,
      {
        get: {
          schema: {
            project: z.string().optional().describe("Google Cloud project ID (defaults to current if remote)"),
            region: z.string().optional().default('europe-west1').describe("Region where the service is located"),
            service: z.string().describe("Name of the Cloud Run service"),
          },
          handler: async ({ project, region, service }) => {
            const actualProject = isRemote ? currentProject : project;
            if (!actualProject) {
              throw new Error("Project ID is required.");
            }
            return await getService(actualProject, region, service);
          },
        },
        list: {
          schema: {
            project: z.string().optional().describe("Google Cloud project ID (defaults to current if remote)"),
            region: z.string().optional().default('europe-west1').describe("Region where the services are located"),
          },
          handler: async ({ project, region }) => {
            const actualProject = isRemote ? currentProject : project;
            if (!actualProject) {
              throw new Error("Project ID is required.");
            }
            const services = await listServices(actualProject, region);
            return services.map(s => ({
                name: s.name.split('/').pop(),
                uri: s.uri,
                region: region, // Or parse from s.name if available
                project: actualProject,
                lastModifier: s.lastModifier // Assuming this is available
            }));
          },
        },
        // Actions for logs can be a separate 'sub-resource' or an action on the service
        // For logs, you might expose them as a streamable capability rather than a direct get action.
        // For example: `server.stream('cloudrun.service.logs', ...)`
        // For simplicity, we'll keep `get_service_log` as a tool for now, but note it could be a resource stream.
      }
    )
  );

  // You would define similar ResourceTemplates for 'Jobs' and 'Worker Pools'
  // if you have corresponding GCP APIs and data structures for them.
  // For example, for Cloud Build Jobs or GKE Worker Pools (Node Pools).
};