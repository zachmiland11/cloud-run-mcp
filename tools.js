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
import { listServices, getService } from './cloud-run-get.js';
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
        return { content: [{ type: 'text', text: "Error: Project ID must be provided." }] };
      }
      if (typeof service !== 'string') {
        return { content: [{ type: 'text', text: "Error: Service name must be provided." }] };
      }
      try {
        const serviceDetails = await getService(project, region, service);
        if (serviceDetails) {
          return {
            content: [{
              type: 'text',
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
    'deploy-local-files',
    'Deploy local files to Cloud Run. Takes an array of absolute file paths from the local filesystem that will be deployed. Use this tool if the files exists on the user local filesystem.',
    {
      project: z.string().describe('Google Cloud project ID. Do not select it yourself, make sure the user provides or confirms the project ID.'),
      region: z.string().default('europe-west1').describe('Region to deploy the service to'),
      service: z.string().default('app').describe('Name of the Cloud Run service to deploy to'),
      files: z.array(z.string()).describe('Array of absolute file paths to deploy (e.g. ["/home/user/project/src/index.js", "/home/user/project/package.json"])'),
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


  server.tool(
    'deploy-local-folder',
    'Deploy a local folder to Cloud Run. Takes an absolute folder path from the local filesystem that will be deployed. Use this tool if the entire folder content needs to be deployed.',
    {
      project: z.string().describe('Google Cloud project ID. Do not select it yourself, make sure the user provides or confirms the project ID.'),
      region: z.string().default('europe-west1').describe('Region to deploy the service to'),
      service: z.string().default('app').describe('Name of the Cloud Run service to deploy to'),
      folderPath: z.string().describe('Absolute path to the folder to deploy (e.g. "/home/user/project/src")'),
    },
    async ({ project, region, service, folderPath }) => {
      console.log({ project, region, service, folderPath });
      console.log(`New folder deploy request: ${JSON.stringify({ project, region, service, folderPath })}`);

      if (typeof project !== 'string') {
        throw new Error('Project must be specified, please prompt the user for a valid existing Google Cloud project ID.');
      }
      if (typeof folderPath !== 'string' || folderPath.trim() === '') {
        throw new Error('Folder path must be specified and be a non-empty string.');
      }

      // Deploy to Cloud Run
      try {
        const response = await deploy({
          projectId: project,
          serviceName: service,
          region: region,
          files: [folderPath], // Pass the folder path as a single item in an array
        });
        return {
          content: [
            {
              type: 'text',
              text: `Cloud Run service ${service} deployed from folder ${folderPath} in project ${project}\nCloud Console: https://console.cloud.google.com/run/detail/${region}/${service}?project=${project}\nService URL: ${response.uri}`,
            }
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error deploying folder to Cloud Run: ${error}`,
            }
          ],
        };
      }
    }
  );

  server.tool(
    'deploy-file-contents',
    'Deploy files to Cloud Run by providing their contents directly. Takes an array of file objects containing filename and content. Use this tool if the files only exist in the current chat context.',
    {
      project: z.string().describe('Google Cloud project ID. Do not select it yourself, make sure the user provides or confirms the project ID.'),
      region: z.string().default('europe-west1').describe('Region to deploy the service to'),
      service: z.string().default('app').describe('Name of the Cloud Run service to deploy to'),
      files: z.array(z.object({
        filename: z.string().describe('Name and path of the file (e.g. "src/index.js" or "data/config.json")'),
        content: z.string().optional().describe('Text content of the file'),
      })).describe('Array of file objects containing filename and content'),
    },
    async ({ project, region, service, files }) => {
      console.log({ project, region, service, files });
      console.log(`New deploy request: ${JSON.stringify({ project, region, service, files })}`);

      if (typeof project !== 'string') {
        throw new Error('Project must specified, please prompt the user for a valid existing Google Cloud project ID.');
      }
      if (typeof files !== 'object' || !Array.isArray(files)) {
        throw new Error('Files must be specified');
      }
      if (files.length === 0) {
        throw new Error('No files specified for deployment');
      }

      // Validate that each file has either content
      for (const file of files) {
        if (!file.content) {
          throw new Error(`File ${file.filename} must have content`);
        }
      }

      // Deploy to Cloud Run
      try {
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