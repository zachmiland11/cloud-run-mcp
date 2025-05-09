/*
Copyright 2025 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { z } from "zod";
import { deploy } from './cloud-run-deploy.js';
import { listServices, getService } from './cloud-run-crud.js';
import { listProjects } from './gcp-projects.js';

export const registerTools = (server) => {
  // Tool to list GCP projects
  server.tool(
    "list-projects",
    "Lists available GCP projects",
    async () => {
      try {
        const projects = await listProjects();
        return {
          content: [{
            type: 'text',
            // TODO: Format this more nicely, perhaps as a list of links to individual project resources
            text: `Available GCP Projects:\n${projects.map(p => `- ${p.id}`).join('\n')}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing GCP projects: ${error.message}`
          }]
        };
      }
    }
  );

  // Listing Cloud Run services
  server.tool(
    "list-services",
    "Lists Cloud Run services in a given project and region.",
    {
      project: z.string().describe("Google Cloud project ID"),
      region: z.string().describe("Region where the services are located").default('europe-west1'),
    },
    async ({ project, region }) => {
      console.log({ project, region });
      if (typeof project !== 'string') {
        return { content: [{ type: 'text', text: "Error: Project ID must be provided and be a non-empty string." }] };
      }

      try {
        const services = await listServices(project, region);
        return {
          content: [{
            type: 'text',
            // TODO: Format this more nicely, perhaps as a list of links to individual service resources
            text: `Services in project ${project} (location ${region}):\n${services.map(s => `- ${s.name} (URL: ${s.uri})`).join('\n')}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing services for project ${project} (region ${region}): ${error.message}`
          }]
        };
      }
    }
  );

  // Dynamic resource for getting a specific service
  server.tool(
    "get-service",
    "Gets details for a specific Cloud Run service.",
    {
      project: z.string().describe("Google Cloud project ID containing the service"),
      region: z.string().describe("Region where the service is located").default('europe-west1'),
      service: z.string().describe("Name of the Cloud Run service"),
    },
    async ({ project, region, service }) => {
      console.log({ project, region, service });
      if (typeof project !== 'string') {
        return { content: [{ type: 'text', text: "Error: Project ID must be provided and be a non-empty string." }] };
      }
      if (typeof service !== 'string') {
        return { content: [{ type: 'text', text: "Error: Service name must be provided and be a non-empty string." }] };
      }
      try {
        const serviceDetails = await getService(project, region, service);
        if (serviceDetails) {
          return {
            content: [{
              type: 'text',
              // TODO: Format this more nicely, maybe with structured data
              text: `Name: ${service}\nRegion: ${region}\nProject: ${project}\nURL: ${serviceDetails.uri}\nLast deployed by: ${serviceDetails.lastModifier}`
            }]
          };
        } else {
          return {
            content: [{
              type: 'text',
              text: `Service ${service} not found in project ${project} (region ${region}).`
            }]
          };
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting service ${service} in project ${project} (region ${region}): ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    'deploy',
    'Deploy files to Cloud Run',
    {
      project: z.string().describe('Google Cloud project ID'),
      region: z.string().default('europe-west1').describe('Region to deploy the service to'),
      service: z.string().default('app').describe('Name of the Cloud Run service to deploy to'),
      files: z.array(z.string()).describe('Files to deploy (provided as file path on the local filesystem)'),
    },
    async ({ project, region, service, files }) => {
      console.log({ project, region, service, files });
      console.log(`New deploy request: ${JSON.stringify({ project, region, service, files })}`);

      // TODO: if remote MCP, just deploy in the same project as the MCP server
      if (typeof project !== 'string') {
        throw new Error('Project must specified, please prompt the user for a valid existing Google Cloud project ID.');
      }
      if (typeof files !== 'object' || !Array.isArray(files)) {
        throw new Error('Files must specified');
      }
      if (files.length === 0) {
        throw new Error('No files specified for deployment');
      }

      // Deploy to Cloud Run
      try {
        // TODO: Should we return intermediate progress messages? we'd need to use sendNotification for that, see https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/examples/server/jsonResponseStreamableHttp.ts#L46C24-L46C41
        const response = await deploy({
          projectId: project,
          serviceName: service,
          region: region,
          files: files,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Cloud Run service ${service} deployed in project ${project}\nCloud Console: https://console.cloud.google.com/run/detail/${region}/${service}?project=${project}\nService URL: ${response.uri}`,
            }
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error deploying to Cloud Run: ${error}`,
            }
          ],
        };
      }
    });
}; 