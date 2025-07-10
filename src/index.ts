/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// Import the necessary AWS SDK v3 clients and commands
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Cloudflare from 'cloudflare';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return new Response('Hello World!');
	},
	async queue(batch, env, ctx) {
		// Check for necessary bindings and secrets
		if (!env.R2_SOURCE_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.CLOUDFLARE_ACCOUNT_ID) {
			console.error('R2 bindings or R2 API credentials are not configured as secrets.');
			batch.retryAll();
			return;
		}
		if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
			console.error('Cloudflare Account ID or API Token for Stream are not configured as secrets.');
			batch.retryAll();
			return;
		}

		const client = new Cloudflare({
			apiToken: env.CLOUDFLARE_API_TOKEN,
		});

		// Create an S3 client configured for Cloudflare R2
		const s3 = new S3Client({
			region: 'auto',
			endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
			credentials: {
				accessKeyId: env.R2_ACCESS_KEY_ID,
				secretAccessKey: env.R2_SECRET_ACCESS_KEY,
			},
		});

		for (const message of batch.messages) {
			try {
				console.log(`Processing message: ${message.id}`);
				const objectKey = (message.body as any)?.object?.key;

				if (!objectKey) {
					console.error('Message body did not contain an object key. Acknowledging to remove from queue.', message.body);
					message.ack();
					continue;
				}

				const command = new GetObjectCommand({
					Bucket: env.R2_SOURCE_BUCKET,
					Key: objectKey,
				});
				const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
				const accountId = env.CLOUDFLARE_ACCOUNT_ID;

				const streamCopy = await client.stream.copy.create({
					account_id: accountId,
					url: presignedUrl,
					meta: {
						name: objectKey,
						bucket: env.R2_SOURCE_BUCKET,
					},
				});

				if (streamCopy.uid) {
					console.log(
						`Successfully initiated upload for '${objectKey}'. Stream is fetching from pre-signed URL. Video UID: ${streamCopy.uid}`
					);

					// Store URLS in KV
					await env.STREAM_URLS.put(objectKey, JSON.stringify({ uid: streamCopy.uid, playback: streamCopy.playback }));

					message.ack();
				} else {
					console.error(
						`Failed to initiate upload via link. Status: ${streamCopy.status?.errorReasonCode}. Error: ${streamCopy.status?.errorReasonText}`
					);
					return message.retry();
				}
			} catch (err) {
				console.error(`An unexpected error occurred while processing message ${message.id}:`, err);
				message.retry();
			}
		}
	},
} satisfies ExportedHandler<Env>;
