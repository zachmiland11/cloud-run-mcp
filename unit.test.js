// --- Unit Tests for add_IAM_Roles tool ---

// Mock the 'addIAMRolesToGCP' function for unit testing.
// In a real scenario, this would be an actual utility function.
const addIAMRolesToGCP = async ({ projectId, roles, serviceAccount }) => {
    // console.log(`[MOCK GCP CALL] Attempting to add roles:`);
    // console.log(`  Project ID: ${projectId}`);
    // console.log(`  Service Account: ${serviceAccount}`);
    // console.log(`  Roles: ${roles.join(', ')}`);
    return { success: true }; // Always return success for mock
};

// The core logic for the 'add_IAM_Roles' tool, copied directly from your MVP HTML.
// In a real Node.js environment, this would be imported.
const add_IAM_Roles = async ({ project, serviceAccountEmail, roles }) => {
    if (typeof project !== 'string' || project.trim() === '') {
        return {
            content: [{
                type: 'text',
                text: 'Google Cloud project ID must be provided and cannot be empty.',
            }],
        };
    }
    if (typeof serviceAccountEmail !== 'string' || serviceAccountEmail.trim() === '') {
        return {
            content: [{
                type: 'text',
                text: 'Service account email must be provided and cannot be empty. This should be the full email address of the service account (e.g., my-service-account@my-project-id.iam.gserviceaccount.com).',
            }],
        };
    }
    if (!Array.isArray(roles) || roles.length === 0) {
        return {
            content: [{
                type: 'text',
                text: 'At least one IAM role must be specified as an array (e.g., ["roles/run.invoker"]).',
            }],
        };
    }

    // Security check: Prevent adding highly privileged roles
    const forbiddenRoles = [
        'roles/owner',
        'roles/editor',
        'roles/admin', // Generic admin role
        'roles/cloudrun.admin', // Cloud Run Admin role
        'roles/iam.securityAdmin',
        'roles/resourcemanager.organizationAdmin',
        'roles/resourcemanager.projectIamAdmin',
        'roles/resourcemanager.folderIamAdmin',
        'roles/iam.serviceAccountAdmin', // Allows managing service accounts
        'roles/iam.serviceAccountKeyAdmin', // Allows managing service account keys
        'roles/compute.admin', // Compute Admin
        'roles/appengine.appAdmin', // App Engine Admin
    ];

    for (const role of roles) {
        if (forbiddenRoles.includes(role.toLowerCase())) { // Ensure case-insensitivity for comparison
            return {
                content: [{
                    type: 'text',
                    text: `Error: Adding the role "${role}" is not allowed. These roles are too permissive and can lead to significant security issues. Please choose more restrictive roles that adhere to the principle of least privilege.`,
                }],
            };
        }
    }

    try {
        const response = await addIAMRolesToGCP({
            projectId: project,
            roles: roles,
            serviceAccount: serviceAccountEmail,
        });

        if (response && response.success) {
            return {
                content: [{
                    type: 'text',
                    text: `IAM roles ${roles.join(', ')} successfully added to service account ${serviceAccountEmail} in project ${project}.`,
                }],
            };
        } else {
            return {
                content: [{
                    type: 'text',
                    text: `Failed to add IAM roles ${roles.join(', ')} to service account ${serviceAccountEmail} in project ${project}. Simulated backend error: ${response.error || 'Unknown error'}.`,
                }],
            };
        }

    } catch (error) {
        return {
            content: [{
                type: 'text',
                text: `Error processing IAM roles request for service account ${serviceAccountEmail} in project ${project}: ${error.message || error}`,
            }],
        };
    }
};

// Simple Assertion Library
const assert = {
    async equals(actual, expected, message) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            console.error(`FAILED: ${message}`);
            console.error(`   Expected: ${JSON.stringify(expected)}`);
            console.error(`   Actual:   ${JSON.stringify(actual)}`);
        } else {
            console.log(` PASSED: ${message}`);
        }
    },
    async throws(fn, expectedErrorSubstring, message) {
        let thrown = false;
        try {
            await fn();
        } catch (e) {
            thrown = true;
            if (e.message.includes(expectedErrorSubstring)) {
                console.log(`PASSED: ${message}`);
            } else {
                console.error(` FAILED: ${message}`);
                console.error(`   Expected error to contain "${expectedErrorSubstring}" but got: "${e.message}"`);
            }
        }
        if (!thrown) {
            console.error(` FAILED: ${message} (No error was thrown)`);
        }
    }
};

// --- Test Cases ---

async function runTests() {
    console.log("--- Running Unit Tests for add_IAM_Roles ---");

    // Test 1: Valid Role Addition (Single Role)
    let result = await add_IAM_Roles({
        project: 'test-project-1',
        serviceAccountEmail: 'test-sa-1@test-project-1.iam.gserviceaccount.com',
        roles: ['roles/run.invoker']
    });
    await assert.equals(result.content[0].text, 'IAM roles roles/run.invoker successfully added to service account test-sa-1@test-project-1.iam.gserviceaccount.com in project test-project-1.', 'Should successfully add a single valid role');

    // Test 2: Valid Role Addition (Multiple Roles)
    result = await add_IAM_Roles({
        project: 'test-project-2',
        serviceAccountEmail: 'test-sa-2@test-project-2.iam.gserviceaccount.com',
        roles: ['roles/storage.objectViewer', 'roles/logging.logWriter']
    });
    await assert.equals(result.content[0].text, 'IAM roles roles/storage.objectViewer, roles/logging.logWriter successfully added to service account test-sa-2@test-project-2.iam.gserviceaccount.com in project test-project-2.', 'Should successfully add multiple valid roles');

    // Test 3: Forbidden Role - Owner
    result = await add_IAM_Roles({
        project: 'forbidden-project',
        serviceAccountEmail: 'forbidden-sa@forbidden-project.iam.gserviceaccount.com',
        roles: ['roles/owner']
    });
    await assert.equals(result.content[0].text, 'Error: Adding the role "roles/owner" is not allowed. These roles are too permissive and can lead to significant security issues. Please choose more restrictive roles that adhere to the principle of least privilege.', 'Should block roles/owner');

    // Test 4: Forbidden Role - Editor
    result = await add_IAM_Roles({
        project: 'forbidden-project',
        serviceAccountEmail: 'forbidden-sa@forbidden-project.iam.gserviceaccount.com',
        roles: ['roles/editor']
    });
    await assert.equals(result.content[0].text, 'Error: Adding the role "roles/editor" is not allowed. These roles are too permissive and can lead to significant security issues. Please choose more restrictive roles that adhere to the principle of least privilege.', 'Should block roles/editor');

    // Test 5: Forbidden Role - Generic Admin
    result = await add_IAM_Roles({
        project: 'forbidden-project',
        serviceAccountEmail: 'forbidden-sa@forbidden-project.iam.gserviceaccount.com',
        roles: ['roles/admin']
    });
    await assert.equals(result.content[0].text, 'Error: Adding the role "roles/admin" is not allowed. These roles are too permissive and can lead to significant security issues. Please choose more restrictive roles that adhere to the principle of least privilege.', 'Should block roles/admin');

    // Test 6: Forbidden Role - Cloud Run Admin
    result = await add_IAM_Roles({
        project: 'forbidden-project',
        serviceAccountEmail: 'forbidden-sa@forbidden-project.iam.gserviceaccount.com',
        roles: ['roles/cloudrun.admin']
    });
    await assert.equals(result.content[0].text, 'Error: Adding the role "roles/cloudrun.admin" is not allowed. These roles are too permissive and can lead to significant security issues. Please choose more restrictive roles that adhere to the principle of least privilege.', 'Should block roles/cloudrun.admin');

    // Test 7: Forbidden Role - Case Insensitivity
    result = await add_IAM_Roles({
        project: 'forbidden-project',
        serviceAccountEmail: 'forbidden-sa@forbidden-project.iam.gserviceaccount.com',
        roles: ['roles/OWNER']
    });
    await assert.equals(result.content[0].text, 'Error: Adding the role "roles/OWNER" is not allowed. These roles are too permissive and can lead to significant security issues. Please choose more restrictive roles that adhere to the principle of least privilege.', 'Should block roles/OWNER (case-insensitive)');

    // Test 8: Mixed Roles (One forbidden, one allowed)
    result = await add_IAM_Roles({
        project: 'forbidden-project',
        serviceAccountEmail: 'forbidden-sa@forbidden-project.iam.gserviceaccount.com',
        roles: ['roles/run.invoker', 'roles/editor']
    });
    await assert.equals(result.content[0].text, 'Error: Adding the role "roles/editor" is not allowed. These roles are too permissive and can lead to significant security issues. Please choose more restrictive roles that adhere to the principle of least privilege.', 'Should block when one role is forbidden');

    // Test 9: Missing Project ID
    result = await add_IAM_Roles({
        project: '',
        serviceAccountEmail: 'test-sa@project.iam.gserviceaccount.com',
        roles: ['roles/run.invoker']
    });
    await assert.equals(result.content[0].text, 'Google Cloud project ID must be provided and cannot be empty.', 'Should return error for empty project ID');

    // Test 10: Missing Service Account Email
    result = await add_IAM_Roles({
        project: 'my-project',
        serviceAccountEmail: '',
        roles: ['roles/run.invoker']
    });
    await assert.equals(result.content[0].text, 'Service account email must be provided and cannot be empty. This should be the full email address of the service account (e.g., my-service-account@my-project-id.iam.gserviceaccount.com).', 'Should return error for empty service account email');

    // Test 11: Empty Roles Array
    result = await add_IAM_Roles({
        project: 'my-project',
        serviceAccountEmail: 'test-sa@project.iam.gserviceaccount.com',
        roles: []
    });
    await assert.equals(result.content[0].text, 'At least one IAM role must be specified as an array (e.g., ["roles/run.invoker"]).', 'Should return error for empty roles array');

    // Test 12: Roles is not an array (e.g., null)
    result = await add_IAM_Roles({
        project: 'my-project',
        serviceAccountEmail: 'test-sa@project.iam.gserviceaccount.com',
        roles: null
    });
    await assert.equals(result.content[0].text, 'At least one IAM role must be specified as an array (e.g., ["roles/run.invoker"]).', 'Should return error if roles is null');

    // Test 13: Roles is not an array (e.g., string)
    result = await add_IAM_Roles({
        project: 'my-project',
        serviceAccountEmail: 'test-sa@project.iam.gserviceaccount.com',
        roles: 'roles/run.invoker' // Incorrect type
    });
    await assert.equals(result.content[0].text, 'At least one IAM role must be specified as an array (e.g., ["roles/run.invoker"]).', 'Should return error if roles is a string');

    console.log("\n--- Unit Test Run Complete ---");
}

// Execute the tests
runTests();
