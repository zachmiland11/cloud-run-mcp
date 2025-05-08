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

import { deploy } from './cloud-run-deploy.js';
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

