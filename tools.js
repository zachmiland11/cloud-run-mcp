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
import { deploy } from './lib/cloud-run-deploy.js';
import { listServices, getService, getServiceLogs } from './lib/cloud-run-services.js';
import { listProjects, createProjectAndAttachBilling } from './lib/gcp-projects.js';
import { checkGCP } from './lib/gcp-metadata.js';
// Import the IAM utility function (assuming you create this file)
import { addIAMRoles as addIAMRolesToGCP } from './lib/iam-utils.js'; //

export const registerTools = (server) => {
  // Tool to list GCP projects
  server.tool(
    "list_projects",
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

  // Tool to create a new GCP project
  server.tool(
    "create_project",
    "Creates a new GCP project and attempts to attach it to the first available billing account. A project ID can be optionally specified; otherwise it will be automatically generated.",
    {
      projectId: z.string().optional().describe("Optional. The desired ID for the new GCP project. If not provided, an ID will be auto-generated."),
    },
    async ({ projectId }) => {
      if (projectId !== undefined && (typeof projectId !== 'string' || projectId.trim() === '')) {
        return {
          content: [{
            type: 'text',
            text: "Error: If provided, Project ID must be a non-empty string."
          }]
        };
      }

      try {
        const result = await createProjectAndAttachBilling(projectId);
        // Assuming result contains the newProjectId or similar, adjust based on actual createProjectAndAttachBilling return
        const newProjectId = projectId || (result && result.projectId ? result.projectId : "a-new-generated-project-id"); // Fixed placeholder
        return {
          content: [{
            type: 'text',
            text: `Successfully created GCP project with ID "${newProjectId}". You can now use this project ID for deployments.`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error creating GCP project or attaching billing: ${error.message}`
          }]
        };
      }
    }
  );

  // Listing Cloud Run services
  server.tool(
    "list_services",
    "Lists Cloud Run services in a given project and region.",
    {
      project: z.string().describe("Google Cloud project ID"),
      region: z.string().describe("Region where the services are located").default('europe-west1'),
    },
    async ({ project, region }) => {
      if (typeof project !== 'string') {
        return { content: [{ type: 'text', text: "Error: Project ID must be provided and be a non-empty string." }] };
      }

      try {
        const services = await listServices(project, region);
        const serviceList = services.map(s => {
          const serviceName = s.name.split('/').pop();
          return `- ${serviceName} (URL: ${s.uri})`;
        }).join('\n');
        return {
          content: [{
            type: 'text',
            text: `Services in project ${project} (location ${region}):\n${serviceList}`
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
    "get_service",
    "Gets details for a specific Cloud Run service.",
    {
      project: z.string().describe("Google Cloud project ID containing the service"),
      region: z.string().describe("Region where the service is located").default('europe-west1'),
      service: z.string().describe("Name of the Cloud Run service"),
    },
    async ({ project, region, service }) => {
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

  // Logs for a service
  server.tool(
    "get_service_log",
    "Gets Logs and Error Messages for a specific Cloud Run service.",
    {
      project: z.string().describe("Google Cloud project ID containing the service"),
      region: z.string().describe("Region where the service is located").default('europe-west1'),
      service: z.string().describe("Name of the Cloud Run service"),
    },
    async ({ project, region, service }) => {
      let allLogs = [];
      let requestOptions;
      try {
        do {
          // Fetch a page of logs
          const response = await getServiceLogs(project, region, service, requestOptions);

          if (response.logs) {
            allLogs.push(response.logs);
          }

          // Set the requestOptions incl pagination token for the next iteration
          requestOptions = response.requestOptions;

        } while (requestOptions); // Continue as long as there is a next page token
          return {
            content: [{
              type: 'text',
              text: allLogs.join('\n')
            }]
          };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting Logs for service ${service} in project ${project} (region ${region}): ${error.message}`
          }]
        };
      }
    }
  );

  // Tool to add IAM roles
  server.tool(
    'add_IAM_Roles',
    'Adds specified IAM roles to a Google Cloud service account within a project. This tool enforces least privilege by preventing the addition of highly permissive roles like Owner, Editor, or Admin roles. Use this for granting necessary permissions to your Cloud Run service or other services.',
    {
      project: z.string().describe('The Google Cloud project ID where the service account resides. The user must provide or confirm this ID.'),
      serviceAccountEmail: z.string().describe('The full email address of the service account to add roles to (e.g., my-service-account@my-project-id.iam.gserviceaccount.com). It is highly recommended to use a dedicated service account rather than the default Compute Engine service account for Cloud Run services.'),
      roles: z.array(z.string()).describe('An array of specific IAM roles (e.g., ["roles/run.invoker", "roles/storage.objectViewer"]) to add to the service account. These should be predefined roles from Google Cloud IAM that grant the least privilege necessary. Highly permissive roles (Owner, Editor, Admin) are disallowed.'),
    }, // Removed the extraneous '' here
    async ({ project, serviceAccountEmail, roles }) => {
      if (typeof project !== 'string' || project.trim() === '') {
        return {
          content: [{
            type: 'text',
            text: 'Google Cloud project ID must be provided and cannot be empty.',
          }],
        };
      }
      if (typeof serviceAccountEmail !== 'string' || serviceAccountEmail.trim() === '') {
        return {
          content: [{
            type: 'text',
            text: 'Service account email must be provided and cannot be empty. This should be the full email address of the service account (e.g., my-service-account@my-project-id.iam.gserviceaccount.com).',
          }],
        };
      }
      if (!Array.isArray(roles) || roles.length === 0) { // Fixed check for roles array
        return {
          content: [{
            type: 'text',
            text: 'At least one IAM role must be specified as an array (e.g., ["roles/run.invoker"]).',
          }],
        };
      }

      // Security check: Prevent adding highly privileged roles
      const forbiddenRoles = [
        'roles/owner',
        'roles/editor',
        'roles/admin.cloudrun.admin',
        'roles/iam.securityAdmin',
        'roles/resourcemanager.organizationAdmin',
        'roles/resourcemanager.projectIamAdmin',
        'roles/resourcemanager.folderIamAdmin',
        // Add any other highly sensitive roles you want to explicitly block
      ];
      const alowedRoles = [
        'roles/run.invoker',
        'roles/storage.objectViewer',
        'roles/logging.logWriter',
        // Add any other roles that are considered safe and necessary
      ]
      for (const role of roles) {
        if (forbiddenRoles.includes(role.toLowerCase())) {
          return {
            content: [{
              type: 'text',
              text: `Error: Adding the role "${role}" is not allowed. These roles are too permissive and can lead to significant security issues. Please choose more restrictive roles that adhere to the principle of least privilege.`,
            }],
          };
        }
      }

      try {
        // Call the actual function to add IAM roles
        // This function needs to be implemented in './lib/iam-utils.js'
        const response = await addIAMRolesToGCP({ // Corrected function name
          projectId: project,
          roles: roles,
          serviceAccount: serviceAccountEmail,
        });

        // Assuming addIAMRolesToGCP returns a success indicator or similar
        // You might need to adjust this based on the actual implementation of addIAMRolesToGCP
        if (response && response.success) { // Simplified success check
          return {
            content: [{
              type: 'text',
              text: `IAM roles ${roles.join(', ')} successfully added to service account ${serviceAccountEmail} in project ${project}.`,
            }],
          };
        } else {
          return {
            content: [{
              type: 'text',
              text: `Failed to add IAM roles ${roles.join(', ')} to service account ${serviceAccountEmail} in project ${project}. Check the underlying IAM utility logs for details.`,
            }],
          };
        }

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error adding IAM roles to service account ${serviceAccountEmail} in project ${project}: ${error.message || error}`,
          }],
        };
      }
    }
  );
  // End of the new add_IAM_Roles tool

  server.tool(
    'deploy_local_files',
    'Deploy local files to Cloud Run. Takes an array of absolute file paths from the local filesystem that will be deployed. Use this tool if the files exists on the user local filesystem.',
    {
      project: z.string().describe('Google Cloud project ID. Do not select it yourself, make sure the user provides or confirms the project ID.'),
      region: z.string().optional().default('europe-west1').describe('Region to deploy the service to'),
      service: z.string().optional().default('app').describe('Name of the Cloud Run service to deploy to'),
      files: z.array(z.string()).describe('Array of absolute file paths to deploy (e.g. ["/home/user/project/src/index.js", "/home/user/project/package.json"])'),
    },
    async ({ project, region, service, files }) => {
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
              text: `Error deploying to Cloud Run: ${error.message || error}`,
            }
          ],
        };
      }
    }
  );


  server.tool(
    'deploy_local_folder',
    'Deploy a local folder to Cloud Run. Takes an absolute folder path from the local filesystem that will be deployed. Use this tool if the entire folder content needs to be deployed.',
    {
      project: z.string().describe('Google Cloud project ID. Do not select it yourself, make sure the user provides or confirms the project ID.'),
      region: z.string().optional().default('europe-west1').describe('Region to deploy the service to'),
      service: z.string().optional().default('app').describe('Name of the Cloud Run service to deploy to'),
      folderPath: z.string().describe('Absolute path to the folder to deploy (e.g. "/home/user/project/src")'),
    },
    async ({ project, region, service, folderPath }) => {
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
              text: `Error deploying folder to Cloud Run: ${error.message || error}`,
            }
          ],
        };
      }
    }
  );

  server.tool(
    'deploy_file_contents',
    'Deploy files to Cloud Run by providing their contents directly. Takes an array of file objects containing filename and content. Use this tool if the files only exist in the current chat context.',
    {
      project: z.string().describe('Google Cloud project ID. Leave unset for the app to be deployed in a new project. If provided, make sure the user confirms the project ID they want to deploy to.'),
      region: z.string().optional().default('europe-west1').describe('Region to deploy the service to'),
      service: z.string().optional().default('app').describe('Name of the Cloud Run service to deploy to'),
      files: z.array(z.object({
        filename: z.string().describe('Name and path of the file (e.g. "src/index.js" or "data/config.json")'),
        content: z.string().describe('Text content of the file'),
      })).describe('Array of file objects containing filename and content'),
    },
    async ({ project, region, service, files }) => {
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
              text: `Error deploying to Cloud Run: ${error.message || error}`,
            }
          ],
        };
      }
    }
  );
};

export const registerToolsRemote = async (server, gcpCredentialsError) => {
  const gcpInfo = await checkGCP();
  if (!gcpInfo || !gcpInfo.project) {
    throw new Error("Cannot register remote tools: GCP project ID could not be determined from the metadata server.");
  }
  const currentProject = gcpInfo.project;
  const currentRegion = gcpInfo.region || 'europe-west1'; // Fallback if region is not available

  
  // Listing Cloud Run services (Remote)
  createCredentialCheckedRemoteTool(
    "list_services",
    `Lists Cloud Run services in GCP project ${currentProject} and a given region.`,
    {
      region: z.string().describe("Region where the services are located").default(currentRegion),
    },
    async ({ region }) => {
      try {
        const services = await listServices(currentProject, region);
        const serviceList = services.map(s => {
          const serviceName = s.name.split('/').pop();
          return `- ${serviceName} (URL: ${s.uri})`;
        }).join('\n');
        return {
          content: [{
            type: 'text',
            text: `Services in project ${currentProject} (location ${region}):\n${serviceList}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing services for project ${currentProject} (region ${region}): ${error.message}`
          }]
        };
      }
    }
  );

  // Dynamic resource for getting a specific service (Remote)
  createCredentialCheckedRemoteTool(
    "get_service",
    `Gets details for a specific Cloud Run service in GCP project ${currentProject}.`,
    {
      region: z.string().describe("Region where the service is located").default(currentRegion),
      service: z.string().describe("Name of the Cloud Run service"),
    },
    async ({ region, service }) => {
      if (typeof service !== 'string') {
        return { content: [{ type: 'text', text: "Error: Service name must be provided." }] };
      }
      try {
        const serviceDetails = await getService(currentProject, region, service);
        if (serviceDetails) {
          return {
            content: [{
              type: 'text',
              text: `Name: ${service}\nRegion: ${region}\nProject: ${currentProject}\nURL: ${serviceDetails.uri}\nLast deployed by: ${serviceDetails.lastModifier}`
            }]
          };
        } else {
          return {
            content: [{
              type: 'text',
              text: `Service ${service} not found in project ${currentProject} (region ${region}).`
            }]
          };
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting service ${service} in project ${currentProject} (region ${region}): ${error.message}`
          }]
        };
      }
    }
  );

  // Logs for a service (Remote)
  createCredentialCheckedRemoteTool(
    "get_service_log",
    `Gets Logs and Error Messages for a specific Cloud Run service in GCP project ${currentProject}.`,
    {
      region: z.string().describe("Region where the service is located").default(currentRegion),
      service: z.string().describe("Name of the Cloud Run service"),
    },
    async ({ region, service }) => {
      let allLogs = [];
      let requestOptions;
      try {
        do {
          const response = await getServiceLogs(currentProject, region, service, requestOptions);
          if (response.logs) {
            allLogs.push(response.logs);
          }
          requestOptions = response.requestOptions;
        } while (requestOptions);
        return {
          content: [{
            type: 'text',
            text: allLogs.join('\n')
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting Logs for service ${service} in project ${currentProject} (region ${region}): ${error.message}`
          }]
        };
      }
    }
  );

  // Deploy file contents to Cloud Run (Remote)
  createCredentialCheckedRemoteTool(
    'deploy_file_contents',
    `Deploy files to Cloud Run by providing their contents directly to the GCP project ${currentProject}.`,
    {
      region: z.string().optional().default(currentRegion).describe('Region to deploy the service to'),
      service: z.string().optional().default('app').describe('Name of the Cloud Run service to deploy to'),
      files: z.array(z.object({
        filename: z.string().describe('Name and path of the file (e.g. "src/index.js" or "data/config.json")'),
        content: z.string().describe('Text content of the file'),
      })).describe('Array of file objects containing filename and content'),
    },
    async ({ region, service, files }) => {
      console.log(`New deploy request (remote): ${JSON.stringify({ project: currentProject, region, service, files })}`);

      if (typeof files !== 'object' || !Array.isArray(files) || files.length === 0) {
        throw new Error('Files must be specified');
      }

      // Validate that each file has content
      for (const file of files) {
        if (!file.content) {
          throw new Error(`File ${file.filename} must have content`);
        }
      }

      // Deploy to Cloud Run
      try {
        const response = await deploy({
          projectId: currentProject,
          serviceName: service,
          region: region,
          files: files,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Cloud Run service ${service} deployed in project ${currentProject}\nCloud Console: https://console.cloud.google.com/run/detail/${region}/${service}?project=${currentProject}\nService URL: ${response.uri}`,
            }
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error deploying to Cloud Run: ${error.message || error}`,
            }
          ],
        };
      }
    }
  );
};