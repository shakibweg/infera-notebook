import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

// Load environment variables from the root .env file
dotenv.config();

const region = process.env.AWS_REGION || 'auto';
const bucketName = process.env.AWS_S3_BUCKET_NAME;
const endpoint = process.env.AWS_ENDPOINT;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

if (!bucketName || !accessKeyId || !secretAccessKey) {
  console.error(
    'Error: Missing required environment variables (AWS_S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)'
  );
  process.exit(1);
}

const s3Client = new S3Client({
  region: region,
  endpoint: endpoint,
  credentials: {
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
  },
});

/**
 * Teardown Bucket Script
 * Deletes all objects in the specified bucket to return it to a clean state, then deletes the bucket itself.
 */
async function teardown() {
  console.log(`--- S3/R2 Bucket Teardown Start ---`);
  console.log(`Target Bucket: ${bucketName}`);

  try {
    // 1. List all objects in the bucket
    console.log(`Listing objects in "${bucketName}"...`);
    const listResult = await s3Client.send(new ListObjectsV2Command({ Bucket: bucketName }));
    const objects = listResult.Contents;

    if (!objects || objects.length === 0) {
      console.log('ℹ️ Bucket is already empty. No objects to clear.');
    } else {
      console.log(`Found ${objects.length} objects. Initiating batch deletion...`);

      // 2. Perform batch deletion
      const deleteParams = {
        Bucket: bucketName,
        Delete: {
          Objects: objects.map((obj) => ({ Key: obj.Key })),
          Quiet: false,
        },
      };

      const deleteResult = await s3Client.send(new DeleteObjectsCommand(deleteParams));

      if (deleteResult.Deleted) {
        console.log(`✅ Successfully deleted ${deleteResult.Deleted.length} objects.`);
      }

      if (deleteResult.Errors && deleteResult.Errors.length > 0) {
        console.warn('⚠️ Some objects could not be deleted:');
        console.table(deleteResult.Errors);
      }
    }

    // 3. Delete the bucket itself
    console.log(`Deleting bucket "${bucketName}"...`);
    await s3Client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    console.log(`✅ Bucket "${bucketName}" deleted successfully.`);

    console.log('\n\x1b[32m%s\x1b[0m', '--- S3/R2 Infrastructure Teardown Complete! ---');
  } catch (error) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ Error during bucket teardown:');
    console.error(error);
    process.exit(1);
  }
}

teardown();
