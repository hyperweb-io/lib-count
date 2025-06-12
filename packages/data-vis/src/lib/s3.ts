import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// Using public bucket, no credentials needed
const s3Client = new S3Client({
  region: "us-east-1",
});

const BUCKET_NAME = "lib-count";

export async function getDataFromS3<T>(key: string): Promise<T> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error(`No data found for key: ${key}`);
    }

    const data = await response.Body.transformToString();
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to fetch data from S3 for key: ${key}`, error);
    throw new Error(
      `Failed to fetch data from S3: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export { s3Client, BUCKET_NAME };
