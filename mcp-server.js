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

import express from 'express';
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// Support SSE for backward compatibility
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { deploy } from './cloud-run-deploy.js';
import { listServices, getService } from './cloud-run-crud.js';
import { listProjects } from './gcp-projects.js';

const getServer = () => {
  // Create an MCP server with implementation details
  const server = new McpServer({
    name: 'cloud-run',
    version: '1.0.0',
  }, { capabilities: { logging: {} } });

  // Resource to list GCP projects
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
        await deploy({
          projectId: project,
          serviceName: service,
          region: region,
          files: files,
        });
        return {
          // TODO: return URL to the deployed service
          content: [
            {
              type: 'text',
              text: `Files deployed to Cloud Run service ${service} in project ${project}`,
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

  return server;
}

const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  console.log('/mcp Received:', req.body);
  const server = getServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req, res) => {
  console.log('Received GET MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  }));
});

app.delete('/mcp', async (req, res) => {
  console.log('Received DELETE MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  }));
});

// Support SSE for baackward compatibility
const sseTransports = {};

// Legacy SSE endpoint for older clients
app.get('/sse', async (req, res) => {
  console.log('/sse Received:', req.body);
  const server = getServer();
  // Create SSE transport for legacy clients
  const transport = new SSEServerTransport('/messages', res);
  sseTransports[transport.sessionId] = transport;
  
  res.on("close", () => {
    delete sseTransports[transport.sessionId];
  });
  
  await server.connect(transport);
});

// Legacy message endpoint for older clients
app.post('/messages', async (req, res) => {
  console.log('/messages Received:', req.body);
  const sessionId = req.query.sessionId;
  const transport = sseTransports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send('No transport found for sessionId');
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cloud Run MCP server listening on port ${PORT}`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  process.exit(0);
});