import { deploy } from './deploy-cloud-run.js'; // Assuming the deploy function is in deploy-cloud-run.js
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

/**
 * Gets the project ID from command line arguments or prompts the user.
 * @returns {Promise<string>} The Google Cloud project ID.
 */
async function getProjectId() {
  let projectId = process.argv[2]; // Get the third element (index 2) which is the first argument

  if (!projectId) {
    const rl = readline.createInterface({ input, output });
    projectId = await rl.question('Please enter your Google Cloud project ID: ');
    rl.close();
  }

  if (!projectId) {
    console.error('Project ID is required.');
    process.exit(1);
  }
  console.log(`Using Project ID: ${projectId}`);
  return projectId;
}


const projectId = await getProjectId();

// Configuration for deployment
const config = {
  projectId: projectId, // Use the obtained project ID
  serviceName: 'example-go-app', // Name of the Cloud Run service
  region: 'europe-west1', // Google Cloud region
  files: [
    'example-sources-to-deploy/main.go',
    'example-sources-to-deploy/go.mod',
    'example-sources-to-deploy/Dockerfile'
  ]
};

await deploy(config);

