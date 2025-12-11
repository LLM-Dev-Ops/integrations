/**
 * File Operations Example
 *
 * This example demonstrates:
 * - Uploading files to Gemini API
 * - Listing uploaded files with pagination
 * - Getting file metadata by name
 * - Waiting for file to become ACTIVE
 * - Deleting files
 *
 * Prerequisites:
 * - Set the GEMINI_API_KEY environment variable
 *
 * Usage:
 * ```bash
 * export GEMINI_API_KEY="your-api-key"
 * npm run build
 * node dist/examples/files.js
 * ```
 */

import { createClientFromEnv } from '../src/index.js';

/**
 * Example 1: Upload a file
 */
async function exampleUploadFile(): Promise<string> {
  console.log('\n=== Example 1: Upload a File ===\n');

  const client = createClientFromEnv();

  // Create a simple test file (a small text file as bytes)
  const fileContent = 'This is a test file for the Gemini API file upload feature.';
  const fileBytes = new TextEncoder().encode(fileContent);

  console.log('Uploading file...');
  console.log(`File size: ${fileBytes.length} bytes`);
  console.log(`MIME type: text/plain\n`);

  const uploadedFile = await client.files.upload({
    fileData: fileBytes,
    mimeType: 'text/plain',
    displayName: 'test-document.txt',
  });

  console.log('File uploaded successfully!');
  console.log(`Name: ${uploadedFile.name}`);
  console.log(`Display Name: ${uploadedFile.displayName}`);
  console.log(`URI: ${uploadedFile.uri}`);
  console.log(`MIME Type: ${uploadedFile.mimeType}`);
  console.log(`Size: ${uploadedFile.sizeBytes} bytes`);
  console.log(`State: ${uploadedFile.state}`);
  console.log(`Created: ${uploadedFile.createTime}`);

  if (uploadedFile.expirationTime) {
    console.log(`Expires: ${uploadedFile.expirationTime}`);
  }

  return uploadedFile.name;
}

/**
 * Example 2: List uploaded files
 */
async function exampleListFiles(): Promise<void> {
  console.log('\n=== Example 2: List Files ===\n');

  const client = createClientFromEnv();

  console.log('Listing all uploaded files...\n');

  const response = await client.files.list({
    pageSize: 10,
  });

  if (response.files && response.files.length > 0) {
    console.log(`Found ${response.files.length} file(s):\n`);

    for (const file of response.files) {
      console.log(`- ${file.displayName || file.name}`);
      console.log(`  Name: ${file.name}`);
      console.log(`  URI: ${file.uri}`);
      console.log(`  State: ${file.state}`);
      console.log(`  Size: ${file.sizeBytes} bytes`);
      console.log();
    }

    if (response.nextPageToken) {
      console.log('More files available. Use nextPageToken to fetch next page.');
    }
  } else {
    console.log('No files found.');
  }
}

/**
 * Example 3: Get file metadata
 */
async function exampleGetFile(fileName: string): Promise<void> {
  console.log('\n=== Example 3: Get File Metadata ===\n');

  const client = createClientFromEnv();

  console.log(`Fetching metadata for file: ${fileName}\n`);

  const file = await client.files.get(fileName);

  console.log('File metadata retrieved:');
  console.log(`Name: ${file.name}`);
  console.log(`Display Name: ${file.displayName}`);
  console.log(`URI: ${file.uri}`);
  console.log(`MIME Type: ${file.mimeType}`);
  console.log(`Size: ${file.sizeBytes} bytes`);
  console.log(`State: ${file.state}`);
  console.log(`Created: ${file.createTime}`);
  console.log(`Updated: ${file.updateTime}`);

  if (file.expirationTime) {
    console.log(`Expires: ${file.expirationTime}`);
  }

  if (file.sha256Hash) {
    console.log(`SHA-256: ${file.sha256Hash}`);
  }
}

/**
 * Example 4: Wait for file to become ACTIVE
 */
async function exampleWaitForActive(fileName: string): Promise<void> {
  console.log('\n=== Example 4: Wait for File to Become ACTIVE ===\n');

  const client = createClientFromEnv();

  console.log(`Checking file state: ${fileName}`);

  // Get current state
  const fileBeforeWait = await client.files.get(fileName);
  console.log(`Current state: ${fileBeforeWait.state}\n`);

  if (fileBeforeWait.state === 'PROCESSING') {
    console.log('File is PROCESSING. Waiting for it to become ACTIVE...');
    console.log('(timeout: 120 seconds, poll interval: 1 second)\n');

    const activeFile = await client.files.waitForActive(
      fileName,
      120000, // 120 seconds timeout
      1000 // 1 second poll interval
    );

    console.log('File is now ACTIVE!');
    console.log(`Name: ${activeFile.name}`);
    console.log(`State: ${activeFile.state}`);
  } else if (fileBeforeWait.state === 'ACTIVE') {
    console.log('File is already ACTIVE. No waiting needed.');
  } else if (fileBeforeWait.state === 'FAILED') {
    console.log('ERROR: File processing failed!');
    if (fileBeforeWait.error) {
      console.log(`Error: ${JSON.stringify(fileBeforeWait.error)}`);
    }
  }
}

/**
 * Example 5: Upload image and wait for processing
 */
async function exampleUploadImageAndWait(): Promise<string> {
  console.log('\n=== Example 5: Upload Image and Wait ===\n');

  const client = createClientFromEnv();

  // Create a simple 1x1 green pixel PNG
  const greenPixelBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==';
  const imageBytes = Buffer.from(greenPixelBase64, 'base64');

  console.log('Uploading image file...');

  const uploadedFile = await client.files.upload({
    fileData: imageBytes,
    mimeType: 'image/png',
    displayName: 'green-pixel.png',
  });

  console.log(`File uploaded: ${uploadedFile.name}`);
  console.log(`State: ${uploadedFile.state}`);

  // Wait for it to be ready
  if (uploadedFile.state === 'PROCESSING') {
    console.log('\nWaiting for image to be processed...');

    const activeFile = await client.files.waitForActive(uploadedFile.name);

    console.log('Image is ready!');
    console.log(`State: ${activeFile.state}`);
  } else {
    console.log('Image is ready immediately!');
  }

  return uploadedFile.name;
}

/**
 * Example 6: Delete a file
 */
async function exampleDeleteFile(fileName: string): Promise<void> {
  console.log('\n=== Example 6: Delete a File ===\n');

  const client = createClientFromEnv();

  console.log(`Deleting file: ${fileName}`);

  await client.files.delete(fileName);

  console.log('File deleted successfully!');

  // Verify deletion by trying to get it (should fail)
  try {
    await client.files.get(fileName);
    console.log('WARNING: File still exists after deletion!');
  } catch (error) {
    console.log('Verified: File no longer exists.');
  }
}

/**
 * Example 7: Pagination through files
 */
async function examplePagination(): Promise<void> {
  console.log('\n=== Example 7: Paginated File Listing ===\n');

  const client = createClientFromEnv();

  console.log('Fetching files with pagination (2 per page)...\n');

  let pageNumber = 1;
  let pageToken: string | undefined = undefined;

  do {
    console.log(`--- Page ${pageNumber} ---`);

    const response = await client.files.list({
      pageSize: 2,
      pageToken,
    });

    if (response.files && response.files.length > 0) {
      for (const file of response.files) {
        console.log(`- ${file.displayName || file.name} (${file.state})`);
      }
    } else {
      console.log('No files on this page.');
    }

    pageToken = response.nextPageToken;
    pageNumber++;

    // Limit to 3 pages for demo purposes
    if (pageNumber > 3) {
      console.log('\n(Stopping after 3 pages for demo purposes)');
      break;
    }

    if (pageToken) {
      console.log(`Next page token: ${pageToken.substring(0, 20)}...`);
      console.log();
    }
  } while (pageToken);

  if (!pageToken) {
    console.log('\nReached end of file list.');
  }
}

/**
 * Main function running all examples
 */
async function main(): Promise<void> {
  let uploadedFileName1: string | null = null;
  let uploadedFileName2: string | null = null;

  try {
    console.log('=== File Operations Examples ===');

    // Upload files
    uploadedFileName1 = await exampleUploadFile();
    uploadedFileName2 = await exampleUploadImageAndWait();

    // List and get files
    await exampleListFiles();
    await exampleGetFile(uploadedFileName1);

    // Wait for active
    await exampleWaitForActive(uploadedFileName1);

    // Pagination
    await examplePagination();

    console.log('\n=== All examples completed successfully! ===');
  } catch (error) {
    console.error('\nError during file operations:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    // Clean up: Delete uploaded files
    console.log('\n=== Cleanup ===\n');

    const client = createClientFromEnv();

    if (uploadedFileName1) {
      try {
        await exampleDeleteFile(uploadedFileName1);
      } catch (error) {
        console.error(`Failed to delete ${uploadedFileName1}:`, error);
      }
    }

    if (uploadedFileName2) {
      try {
        await exampleDeleteFile(uploadedFileName2);
      } catch (error) {
        console.error(`Failed to delete ${uploadedFileName2}:`, error);
      }
    }
  }
}

// Run the examples
main();
