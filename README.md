# Cloud Run MCP server

An MCP server to deploy code to Google Cloud Run.

## Tools

- `deploy-file-contents`: Deploys files to Cloud Run by providing their contents directly.
- `list-services`: Lists Cloud Run services in a given project and region.
- `get-service`: Gets details for a specific Cloud Run service.
- `deploy-local-files`*: Deploys files from the local file system to a Google Cloud Run service.
- `deploy-local-folder`*: Deploys a local folder to a Google Cloud Run service.
- `list-projects`*: Lists available GCP projects.
- `create-project`*: Creates a new GCP project and attach it to the first available billing account. A project ID can be optionally specified.


_\* only available when running locally_


## Use as local MCP server

Run the Cloud Run MCP server on your local machine using local Google Cloud credentials. This is best if you are using an AI-assisted IDE (e.g. Cursor) or a desktop AI application (e.g. Claude).

0. Install [Node.js](https://nodejs.org/en/download/) (LTS version recommended).

1. Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) and authenticate with your Google account.

2. Set up application credentials using the command:
   ```bash
   gcloud auth application-default login
   ```
4. Update the MCP configuration file of your MCP client with the following:

   ```json 
    {
      "mcpServers": {
        "cloud-run": {
          "command": "npx",
          "args": [
            "https://github.com/GoogleCloudPlatform/cloud-run-mcp"
          ]
        }
      }
    }
   ```

## Use as remote MCP server

> [!WARNING]  
> Do not use the remote MCP server without authentication. In the following instructions, we will use IAM authentication to secure the connection to the MCP server from your local machine. This is important to prevent unauthorized access to your Google Cloud resources.

Run the Cloud Run MCP server itself on Cloud Run with connection from your local machine authenticated via IAM.
With this option, you will only be able to deploy code to the same Google Cloud project as where the MCP server is running.

1. Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) and authenticate with your Google account.

2. Set your Google Cloud project ID using the command:
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```
3. Deploy the Cloud Run MCP server to Cloud Run:
   ```bash
   gcloud run deploy cloud-run-mcp --image us-docker.pkg.dev/cloudrun/container/mcp --no-allow-unauthenticated
   ```
   When prompted, pick a region, for example `europe-west1`.

   Note that the MCP server is *not* publicly accessible, it requires authentication via IAM.

3. Run a Cloud Run proxy on your local machine to connect securely using your identity to the remote MCP server running on Cloud Run:
   ```bash
   gcloud run services proxy cloud-run-mcp
   ```
   This will create a local proxy on port 8080 that forwards requests to the remote MCP server and injects your identity.

5. Update the MCP configuration file of your MCP client with the following, replace the URL with the URL of the deployed service:

   ```json 
    {
      "mcpServers": {
        "cloud-run": {
          "url": "http://localhost:8080/sse"
        }
      }
    }
   ```
   If your MCP client does not support the `url` attribute, you can use [mcp-remote](https://www.npmjs.com/package/mcp-remote):

   ```json 
    {
      "mcpServers": {
        "cloud-run": {
          "command": "npx",
          "args": [
            "mcp-remote",
            "http://localhost:8080/sse"
          ]
        }
      }
    }
   ```
