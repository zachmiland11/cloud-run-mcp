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

import {ProjectsClient} from '@google-cloud/resource-manager';

/**
 * Lists all accessible Google Cloud Platform projects.
 * @async
 * @function listProjects
 * @returns {Promise<Array<{id: string}>>} A promise that resolves to an array of project objects, each with an 'id' property. Returns an empty array on error.
 */
export async function listProjects() {
  const client = new ProjectsClient();
  try {
    const [projects] = await client.searchProjects();
    return projects.map(project => ({
      id: project.projectId,
    }));
  } catch (error) {
    console.error('Error listing GCP projects:', error);
    return [];
  }
}

/**
 * Creates a new Google Cloud Platform project.
 * @async
 * @function createProject
 * @param {string} [projectId] - Optional. The desired ID for the new project. If not provided, a compliant ID will be generated automatically (e.g., app-cvc-cvc).
 * @returns {Promise<{projectId: string}|null>} A promise that resolves to an object containing the new project's ID.
 */
export async function createProject(projectId) {
  const client = new ProjectsClient();
  let projectIdToUse = projectId;

  if (!projectIdToUse) {
    const consonants = 'bcdfghjklmnpqrstvwxyz';
    const vowels = 'aeiou';

    const getRandomChar = (source) => source.charAt(Math.floor(Math.random() * source.length));

    const generateCVC = () => {
      const c1 = getRandomChar(consonants);
      const v = getRandomChar(vowels);
      const c2 = getRandomChar(consonants);
      return `${c1}${v}${c2}`;
    };

    const cvc1 = generateCVC();
    const cvc2 = generateCVC();
    projectIdToUse = `mcp-${cvc1}-${cvc2}`;
    console.log(`Project ID not provided, generated ID: ${projectIdToUse}`);
  }

  try {
    const projectPayload = { projectId: projectIdToUse };

    console.log(`Attempting to create project with ID: ${projectIdToUse}`);

    const [operation] = await client.createProject({ project: projectPayload });

    const [createdProjectResponse] = await operation.promise();

    console.log(`Project ${createdProjectResponse.projectId} created successfully.`);
    return {
      projectId: createdProjectResponse.projectId,
    };
  } catch (error) {
    console.error(`Error creating GCP project ${projectIdToUse}:`, error.message);
    return null;
  }
}
