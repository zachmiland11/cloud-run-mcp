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

import { v2 } from '@google-cloud/run';
const { ServicesClient } = v2;

let runClient;

/**
 * Lists all Cloud Run services in a given project and location.
 * @param {string} projectId - The Google Cloud project ID.
 * @param {string} location - The Google Cloud location (e.g., 'europe-west1').
 * @returns {Promise<Array<object>>} - A promise that resolves to an array of service objects.
 */
export async function listServices(projectId, location) {
  // TODO make location optional, if not provided, list all services from all regions
  if (!runClient) {
    runClient = new ServicesClient({ projectId });
  }
  const parent = runClient.locationPath(projectId, location);

  try {
    console.log(`Listing Cloud Run services in project ${projectId}, location ${location}...`);
    const [services] = await runClient.listServices({ parent });
    return services;
  } catch (error) {
    console.error(`Error listing Cloud Run services:`, error);
    throw error;
  }
}

/**
 * Gets details for a specific Cloud Run service.
 * @param {string} projectId - The Google Cloud project ID.
 * @param {string} location - The Google Cloud location (e.g., 'europe-west1').
 * @param {string} serviceId - The ID of the Cloud Run service.
 * @returns {Promise<object>} - A promise that resolves to the service object.
 */
export async function getService(projectId, location, serviceId) {
  if (!runClient) {
    runClient = new ServicesClient({ projectId });
  }

  const servicePath = runClient.servicePath(projectId, location, serviceId);

  try {
    console.log(`Getting details for Cloud Run service ${serviceId} in project ${projectId}, location ${location}...`);
    const [service] = await runClient.getService({ name: servicePath });
    return service;
  } catch (error) {
    console.error(`Error getting details for Cloud Run service ${serviceId}:`, error);
    // Check if the error is a "not found" error (gRPC code 5)
    if (error.code === 5) {
      console.log(`Cloud Run service ${serviceId} not found.`);
      return null; // Or throw a custom error, or handle as needed
    }
    throw error; // Re-throw other errors
  }
} 