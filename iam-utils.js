// lib/iam-utils.js
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Adds IAM roles to a Google Cloud service account.
 * @param {object} params - The parameters for adding IAM roles.
 * @param {string} params.projectId - The Google Cloud project ID.
 * @param {string[]} params.roles - An array of IAM role names (e.g., "roles/run.invoker").
 * @param {string} params.serviceAccount - The email address of the service account.
 * @returns {Promise<{success: boolean, message?: string}>} - A promise that resolves with success status.
 */
export const addIAMRoles = async ({ projectId, roles, serviceAccount }) => {
  console.log(`Attempting to add roles ${roles.join(', ')} to service account ${serviceAccount} in project ${projectId}`);

  let allSuccess = true;
  let messages = [];

  for (const role of roles) {
    const command = `gcloud projects add-iam-policy-binding ${projectId} --member=serviceAccount:${serviceAccount} --role=${role} --quiet`;
    console.log(`Executing command: ${command}`);
    try {
      const { stdout, stderr } = await execAsync(command);
      messages.push(`Successfully added role ${role}.`);
      if (stdout) console.log(`Stdout for ${role}: ${stdout}`);
      if (stderr) console.warn(`Stderr for ${role}: ${stderr}`);
    } catch (cmdError) {
      allSuccess = false;
      messages.push(`Failed to add role ${role}: ${cmdError.message}`);
      console.error(`Error adding role ${role}: ${cmdError.message}`);
      // Decide if you want to throw immediately or collect all errors
      // For this example, we collect and return overall status.
    }
  }

  if (allSuccess) {
    return { success: true, message: messages.join('\n') };
  } else {
    // If any role failed, return success: false and combine error messages
    return { success: false, message: messages.join('\n') };
  }
};