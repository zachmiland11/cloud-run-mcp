# Cloud Run MCP server

An MCP server to deploy code to Google Cloud Run.

## Tools

- `list-projects`: Lists available GCP projects.
- `list-services`: Lists Cloud Run services in a given project and region.
- `get-service`: Gets details for a specific Cloud Run service.
- `deploy-local-files`: Deploys files from the local file system to a Google Cloud Run service.
- `deploy-file-contents`: Deploys files to Cloud Run by providing their contents directly.

## Use as local MCP server

> [!NOTE]  
> These instructions will change when the MCP server is made public. It should be as simple as an `npx` or `docker run` command.


0. Install [Node.js](https://nodejs.org/en/download/) (LTS version recommended).

1. Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) and authenticate with your Google account.

2. Set up application credentials using the command:
   ```bash
   gcloud auth application-default login
   ```
3. Start local MCP server:
   ```bash
   npm start
   ```

4. Update the MCP configuration file of your MCP client with the following:
   ```json 
    {
      "mcpServers": {
        "cloud-run": {
          "command": "npx",
          "args": [
            "mcp-remote",
            "http://localhost:3000/sse"
          ]
        }
      }
    }
   ```

## Use as remote MCP server

When using as a remote MCP server, only the `deploy-file-contents` tool can be used. The `deploy-local-files` tool is not supported as it expects to be able to access the local file system.

> [!WARNING]  
> The MCP server currently does not support authentication. Anyone with the URL can deploy code to your Google Cloud project.

0. Install [Node.js](https://nodejs.org/en/download/) (LTS version recommended).

1. Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) and authenticate with your Google account.

2. Set your Google Cloud project ID using the command:
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```
3. Deploy the application to Cloud Run:
   ```bash
   npm run deploy
   ```
   When prompted, pick a region, for example `europe-west1`.

4. Update the MCP configuration file of your MCP client with the following, replace `PROJECT_NUMBER` and `REGION` with the values from the previous step:
   ```json 
    {
      "mcpServers": {
        "cloud-run": {
          "command": "npx",
          "args": [
            "mcp-remote",
            "https://cloud-run-mcp-PROJECT_NUMBER.REGION.run.app/sse"
          ]
        }
      }
    }
   ```
