import express from 'express';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// Support SSE for backward compatibility
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { deploy } from './deploy.js';

const getServer = () => {
  // Create an MCP server with implementation details
  const server = new McpServer({
    name: 'cloud-run',
    version: '1.0.0',
  }, { capabilities: { logging: {} } });


  // Register a tool specifically for testing resumability
  server.tool(
    'deploy',
    'Deploy files to Cloud Run',
    {
      project: { type: 'string', description: 'Project ID' },
      region: { type: 'string', description: 'Region to deploy the service to', default: 'europe-west1' },
      service: { type: 'string', description: 'Name of the Cloud Run service to deploy to' },
      files: { type: 'array', description: 'Files to deploy', items: { type: 'string' } },
    },
    async ({ project, region, service, files }) => {
      if (typeof project !== 'string') {
        throw new Error('Project must specified');
      }
      if (typeof service !== 'string') {
        throw new Error('Service must specified');
      }
      if (typeof files !== 'array') {
        throw new Error('Files must specified');
      }

      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      let counter = 0;

      while (count === 0 || counter < count) {
        counter++;
        try {
          await sendNotification({
            method: "notifications/message",
            params: {
              level: "info",
              data: `Periodic notification #${counter} at ${new Date().toISOString()}`
            }
          });
        }
        catch (error) {
          console.error("Error sending notification:", error);
        }
        // Wait for the specified interval
        await sleep(interval);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Started sending periodic notifications every ${interval}ms`,
          }
        ],
      };
    }
  );

  // TODO services as resources
  return server;
}

const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
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
  console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  process.exit(0);
});