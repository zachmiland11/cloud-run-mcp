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

import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { Storage } from '@google-cloud/storage';
import { CloudBuildClient } from '@google-cloud/cloudbuild';
import { ArtifactRegistryClient } from '@google-cloud/artifact-registry';
import { v2 } from '@google-cloud/run';
const { ServicesClient } = v2;
import { ServiceUsageClient } from '@google-cloud/service-usage';

// Configuration
const REPO_NAME = 'mcp-cloud-run-deployments';
const ZIP_FILE_NAME = 'source.zip';
const IMAGE_TAG = 'latest';
const REQUIRED_APIS = [
  'iam.googleapis.com',
  'storage.googleapis.com',
  'cloudbuild.googleapis.com',
  'artifactregistry.googleapis.com',
  'run.googleapis.com',
];

// Initialize Clients
let storage;
let cloudBuildClient;
let artifactRegistryClient;
let runClient;

/**
 * Ensures that all necessary Google Cloud APIs are enabled for the project.
 * @param {string} projectId - The Google Cloud project ID.
 * @param {string[]} apis - An array of API identifiers (e.g., 'run.googleapis.com').
 */
async function ensureApisEnabled(projectId, apis) {
  const serviceUsageClient = new ServiceUsageClient({ projectId });
  console.log('Checking and enabling required APIs...');

  for (const api of apis) {
    const serviceName = `projects/${projectId}/services/${api}`;
    try {
      const [service] = await serviceUsageClient.getService({ name: serviceName });
      if (service.state !== 'ENABLED') {
        console.log(`API [${api}] is not enabled. Enabling...`);
        const [operation] = await serviceUsageClient.enableService({ name: serviceName });
        await operation.promise();
      }
    } catch (error) {
      throw new Error(`Failed to ensure API [${api}] is enabled. Please check manually.`);
    }
  }
  console.log('All required APIs are enabled.');
}

/**
 * Checks if a Cloud Run service exists.
 */
async function checkCloudRunServiceExists(projectId, location, serviceId) {
  const parent = runClient.locationPath(projectId, location);
  const servicePath = runClient.servicePath(projectId, location, serviceId);
  try {
    await runClient.getService({ name: servicePath });
    console.log(`Cloud Run service ${serviceId} already exists.`);
    return true;
  } catch (error) {
    // Assuming 'NOT_FOUND' error code indicates non-existence
    if (error.code === 5) { // 5 corresponds to NOT_FOUND in gRPC
       console.log(`Cloud Run service ${serviceId} does not exist.`);
       return false;
    }
    console.error(`Error checking Cloud Run service ${serviceId}:`, error);
    throw error; // Re-throw other errors
  }
}

/**
 * Deploys or updates a container to Google Cloud Run.
 */
async function deployToCloudRun(projectId, location, serviceId, imgUrl) {
  const parent = runClient.locationPath(projectId, location);
  const servicePath = runClient.servicePath(projectId, location, serviceId);

  const service = {
    template: {
      containers: [{ image: imgUrl }],
    },
    invokerIamDisabled: true, // Make public
    labels: {
      'created-by': 'cloud-run-mcp',
    },
  };

  try {
    const exists = await checkCloudRunServiceExists(projectId, location, serviceId);
    let operation;
    if (exists) {
      console.log(`Updating existing service ${serviceId}...`);
      service.name = servicePath; // Required for update
      [operation] = await runClient.updateService({ service });
    } else {
      console.log(`Creating new service ${serviceId}...`);
      [operation] = await runClient.createService({
        parent: parent,
        service: service,
        serviceId: serviceId,
      });
    }

    console.log(`Deploying ${serviceId} to Cloud Run...`);
    const [response] = await operation.promise(); // Wait for completion

    console.log(`Service deployed/updated successfully: ${response.uri}`);
    return response;
  } catch (error) {
    console.error(`Error deploying/updating service ${serviceId}:`, error);
    throw error;
  }
}

/**
 * Ensures a Google Cloud Storage bucket exists, creating it if necessary.
 */
async function ensureStorageBucketExists(bucketName, location = 'us') {
  const bucket = storage.bucket(bucketName);
  try {
    const [exists] = await bucket.exists();
    if (exists) {
      console.log(`Bucket ${bucketName} already exists.`);
      return bucket; // Bucket exists
    } else {
      console.log(`Bucket ${bucketName} does not exist. Creating in location ${location}...`);
      try {
        const [createdBucket] = await storage.createBucket(bucketName, {
          location: location,
        });
        console.log(`Storage bucket ${createdBucket.name} created successfully in ${location}.`);
        return createdBucket; // Return the newly created bucket
      } catch (createError) {
        // Handle potential errors during creation, e.g., permissions, naming conflicts after check
        console.error(`Failed to create storage bucket ${bucketName}. Error details:`, createError);
        throw createError;
      }
    }
  } catch (error) {
    // Handle errors during the exists() check
    console.error(`Error checking/creating bucket ${bucketName}:`, error);
    throw error;
  }
}

/**
 * Zips a list of files and directories into a memory buffer.
 * @param {string[]} files - List of files and directories to zip
 * @returns {Promise<Buffer>} - Returns a promise that resolves to the zip file buffer
 */
function zipFiles(files) {
  return new Promise((resolve, reject) => {
    console.log('Creating in-memory zip archive...');
    const chunks = [];
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => {
      console.log(`Files zipped successfully. Total size: ${archive.pointer()} bytes`);
      resolve(Buffer.concat(chunks));
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('Archiver warning:', err);
      } else {
        reject(err);
      }
    });

    archive.on('error', (err) => {
      reject(err);
    });

    // Add each file to the zip
    files.forEach(file => {
      // Check if this is a file content object or a local file path
      if (typeof file === 'object' && 'filename' in file && 'content' in file) {
        // This is a file content object
        archive.append(file.content, { name: file.filename });
      } else if (typeof file === 'string') {
        // This is a local file path     
        let pathInput = file;

        // This is a "hack" to better support WSL on Windows. AI agents tend to send path that start with '/c' in that case. Re-write it to '/mnt/c'
        if (pathInput.startsWith('/c')) {
          pathInput = `/mnt${pathInput}`;
        }
        const filePath = path.resolve(pathInput);
        if (!fs.existsSync(filePath)) {
          throw new Error(`File or directory not found: ${filePath}`);
        }
        
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          archive.directory(filePath, false); // Add directory contents to the archive root
        } else {
          archive.file(filePath, { name: path.basename(filePath) });
        }
      } else {
        throw new Error(`Invalid file format: ${JSON.stringify(file)}`);
      }
    });

    archive.finalize();
  });
}

/**
 * Uploads a buffer to a Google Cloud Storage bucket.
 */
async function uploadToStorageBucket(bucket, buffer, destinationBlobName) {
  try {
    console.log(`Uploading buffer to gs://${bucket.name}/${destinationBlobName}...`);
    await bucket.file(destinationBlobName).save(buffer);
    console.log(`File ${destinationBlobName} uploaded successfully to gs://${bucket.name}/${destinationBlobName}.`);
    return bucket.file(destinationBlobName);
  } catch (error) {
    console.error(`Error uploading buffer:`, error);
    throw error;
  }
}

/**
 * Ensures an Artifact Registry repository exists, creating it if necessary.
 */
async function ensureArtifactRegistryRepoExists(projectId, location, repositoryId, format = 'DOCKER') {
  // Construct the parent path string manually
  const parent = `projects/${projectId}/locations/${location}`;
  const repoPath = artifactRegistryClient.repositoryPath(projectId, location, repositoryId);

  try {
    // Attempt to get the repository
    const [repository] = await artifactRegistryClient.getRepository({ name: repoPath });
    console.log(`Repository ${repositoryId} already exists in ${location}.`);
    return repository; // Repository exists
  } catch (error) {
    // If it's a 'NOT_FOUND' error, create the repository
    if (error.code === 5) { // 5 corresponds to NOT_FOUND in gRPC
      console.log(`Repository ${repositoryId} does not exist in ${location}. Creating...`);
      const repositoryToCreate = {
        format: format,
      };
      try {
        const [operation] = await artifactRegistryClient.createRepository({
          parent: parent,
          repository: repositoryToCreate,
          repositoryId: repositoryId,
        });
        console.log(`Creating Artifact Registry repository ${repositoryId}...`);
        const [result] = await operation.promise(); // Wait for completion
        console.log(`Artifact Registry repository ${result.name} created successfully.`);
        return result;
      } catch (createError) {
        console.error(`Failed to create Artifact Registry repository ${repositoryId}. Error details:`, createError);
        throw createError; // Re-throw creation error
      }
    } else {
      // If it's another error, log and re-throw
      console.error(`Error checking/creating repository ${repositoryId}:`, error);
      throw error;
    }
  }
}

/**
 * Triggers a Cloud Build job.
 */
async function triggerCloudBuild(projectId, location, sourceBucketName, sourceBlobName, targetRepoName, targetImageUrl, hasDockerfile) {
  let buildSteps;

  if (hasDockerfile) {
    buildSteps = [
      {
        name: 'gcr.io/cloud-builders/docker',
        args: ['build', '-t', targetImageUrl, '.'],
        dir: '/workspace',
      },
    ];
  } else {
    buildSteps = [
      {
        name: 'gcr.io/k8s-skaffold/pack',
        entrypoint: 'pack',
        args: [
          'build',
          targetImageUrl,
          '--builder',
          'gcr.io/buildpacks/builder:latest',
        ],
        dir: '/workspace',
      },
    ];
  }

  const build = {
    source: {
      storageSource: {
        bucket: sourceBucketName,
        object: sourceBlobName,
      },
    },
    steps: buildSteps,
    images: [targetImageUrl],
  };

  try {
    console.log(`Initiating Cloud Build for gs://${sourceBucketName}/${sourceBlobName} in ${location}...`);
    const [operation] = await cloudBuildClient.createBuild({
      projectId: projectId,
      build: build,
    });

    console.log(`Cloud Build job started...`);
    const buildId = operation.metadata.build.id;
    let completedBuild;
    while (true) {
      const [getBuildOperation] = await cloudBuildClient.getBuild({ projectId: projectId, id: buildId });
      if (['SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED'].includes(getBuildOperation.status)) {
        completedBuild = getBuildOperation;
        break;
      }
      console.log(`Build status: ${getBuildOperation.status}. Waiting...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (completedBuild.status === 'SUCCESS') {
      console.log(`Cloud Build job ${buildId} completed successfully.`);
      console.log(`Image built: ${completedBuild.results.images[0].name}`);
      return completedBuild;
    } else {
       console.error(`Cloud Build job ${buildId} failed with status: ${completedBuild.status}`);
       console.error('Build logs:', completedBuild.logUrl);
       throw new Error(`Cloud Build failed: ${completedBuild.status}`);
    }

  } catch (error) {
    console.error(`Error triggering Cloud Build:`, error);
    throw error;
  }
}

/**
 * Configuration object for deployment
 * @typedef {Object} DeployConfig
 * @property {string} projectId - The Google Cloud project ID
 * @property {string} [serviceName='app'] - The name of the Cloud Run service to deploy
 * @property {string} [region='europe-west1'] - The Google Cloud region to deploy to
 * @property {string[]} files - List of files or directories to deploy
 */

/**
 * Main deployment function.
 * @param {DeployConfig} config - The deployment configuration object
 */
export async function deploy({ projectId, serviceName = 'app', region = 'europe-west1', files }) {
  if (!projectId) {
    console.error("Error: projectId is required in the configuration object.");
    process.exit(1);
  }

  if (!files || !Array.isArray(files) || files.length === 0) {
    console.error("Error: files array is required in the configuration object.");
    process.exit(1);
  }

  try {
    // 0. Ensure all required APIs are enabled
    await ensureApisEnabled(projectId, REQUIRED_APIS);

    // Initialize clients with the provided projectId
    storage = new Storage({ projectId });
    cloudBuildClient = new CloudBuildClient({ projectId });
    artifactRegistryClient = new ArtifactRegistryClient({ projectId });
    runClient = new ServicesClient({ projectId });

    // Set derived configuration values
    const bucketName = `${projectId}-source-bucket`;
    const imageUrl = `${region}-docker.pkg.dev/${projectId}/${REPO_NAME}/${serviceName}:${IMAGE_TAG}`;

    console.log(`Project: ${projectId}`);
    console.log(`Region: ${region}`);
    console.log(`Service Name: ${serviceName}`);
    console.log(`Files to deploy: ${files.length}`);

    // Check for Dockerfile
    let hasDockerfile = false;
    for (const file of files) {
      if (typeof file === 'string') {
        if (path.basename(file).toLowerCase() === 'dockerfile') {
          hasDockerfile = true;
          break;
        }
      } else if (typeof file === 'object' && file.filename) {
        if (path.basename(file.filename).toLowerCase() === 'dockerfile') {
          hasDockerfile = true;
          break;
        }
      }
    }
    console.log(`Dockerfile: ${hasDockerfile}`);

    // Ensure Storage Bucket Exists
    const bucket = await ensureStorageBucketExists(bucketName, region);

    // Zip and Upload Source Code
    const zipBuffer = await zipFiles(files);
    await uploadToStorageBucket(bucket, zipBuffer, ZIP_FILE_NAME);
    console.log('Source code uploaded successfully');

    // Ensure Artifact Registry Repo Exists
    await ensureArtifactRegistryRepoExists(projectId, region, REPO_NAME);

    // Trigger Cloud Build
    const buildResult = await triggerCloudBuild(projectId, region, bucketName, ZIP_FILE_NAME, REPO_NAME, imageUrl, hasDockerfile);
    if (!buildResult || buildResult.status !== 'SUCCESS') {
       throw new Error('Cloud Build did not complete successfully.');
    }
    const builtImageUrl = buildResult.results.images[0].name;

    const service = await deployToCloudRun(projectId, region, serviceName, builtImageUrl);

    console.log(`Deployment Completed Successfully`);
    return service;

  } catch (error) {
    console.error(`Deployment Failed`);
    console.error(error.message || error);
    throw error;
  }
}
