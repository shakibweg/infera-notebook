import {
  S3Client,
  CreateBucketCommand,
  PutBucketCorsCommand,
  HeadBucketCommand,
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

async function setup() {
  console.log(`--- S3/R2 Bucket Setup Start ---`);
  console.log(`Bucket Name: ${bucketName}`);
  console.log(`Region: ${region}`);
  if (endpoint) console.log(`Endpoint: ${endpoint}`);

  try {
    // 1. Check if bucket exists
    console.log(`Checking if bucket "${bucketName}" exists...`);
    let bucketExists = false;
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
      bucketExists = true;
      console.log(`✅ Bucket "${bucketName}" already exists.`);
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        bucketExists = false;
      } else {
        throw error;
      }
    }

    // 2. Create bucket if it doesn't exist
    if (!bucketExists) {
      console.log(`Bucket does not exist. Creating...`);
      await s3Client.send(
        new CreateBucketCommand({
          Bucket: bucketName,
        })
      );
      console.log(`✅ Bucket "${bucketName}" created successfully.`);
    }

    // 3. Configure CORS
    console.log('Configuring CORS policy...');
    const corsConfiguration = {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
          AllowedOrigins: ['*'], // Replace with specific domains in production for better security
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3000,
        },
      ],
    };

    await s3Client.send(
      new PutBucketCorsCommand({
        Bucket: bucketName,
        CORSConfiguration: corsConfiguration,
      })
    );
    console.log('✅ CORS configuration updated successfully.');

    console.log('\n\x1b[32m%s\x1b[0m', '--- S3/R2 Infrastructure Setup Complete! ---');
  } catch (error) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ Error during setup:');
    console.error(error);
    process.exit(1);
  }
}

setup();
