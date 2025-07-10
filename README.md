# R2-Auto-Stream: R2 to Cloudflare Stream Integration

This Cloudflare Workers project automatically transfers video files from Cloudflare R2 storage to Cloudflare Stream for optimized video delivery. When a video file is uploaded to R2, it triggers a queue message that processes the file and creates a Stream video asset.

## Architecture Overview

1. **R2 Bucket**: Stores original video files
2. **Queue Consumer**: Processes upload notifications
3. **Cloudflare Stream**: Hosts and delivers optimized videos
4. **KV Storage**: Stores mapping between R2 objects and Stream URLs

## Prerequisites

- Cloudflare account with access to:
  - Cloudflare Workers
  - Cloudflare R2
  - Cloudflare Stream
  - Cloudflare KV
  - Cloudflare Queues
- Node.js and pnpm installed
- Wrangler CLI installed (`npm install -g wrangler`)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <your-repo>
cd r2-auto-stream
pnpm install
```

### 2. Authenticate Wrangler

```bash
wrangler login
```

### 3. Create Required Cloudflare Resources

#### Create R2 Bucket
```bash
wrangler r2 bucket create your-source-bucket
```

#### Create KV Namespace
```bash
wrangler kv:namespace create "STREAM_URLS"
wrangler kv:namespace create "STREAM_URLS" --preview
```

#### Create Queue
```bash
wrangler queues create video-processing-queue
```

### 4. Configure R2 API Credentials

1. Go to Cloudflare Dashboard → R2 → Manage R2 API tokens
2. Create a new R2 API token with:
    - **Permissions**: Object Read & Write
    - **Bucket**: Your source bucket
3. Note down the **Access Key ID** and **Secret Access Key**

### 5. Create Cloudflare API Token for Stream

1. Go to Cloudflare Dashboard → Manage Account (on the left sidebar) → Account API Tokens
    - or go to Cloudflare Dashboard → My Profile → API Tokens
2. Create a custom token with:
    - **Permissions**: 
      - Account - Cloudflare Stream:Edit
    - **Account Resources**: Include your account
    - **Zone Resources**: All zones (if needed)
3. Note down the **API Token**

### 6. Configure Environment Variables

Create or update your `wrangler.jsonc` file:

```jsonc
{
  "name": "auto-stream",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "queue_consumers": [
    {
      "queue": "video-processing-queue",
      "max_batch_size": 10,
      "max_batch_timeout": 5
    }
  ],
  "kv_namespaces": [
    {
      "binding": "STREAM_URLS",
      "id": "your-kv-namespace-id",
      "preview_id": "your-preview-kv-namespace-id"
    }
  ],
  "r2_buckets": [
    {
      "binding": "R2_SOURCE_BUCKET",
      "bucket_name": "your-source-bucket"
    }
  ],
  "vars": {
    "CLOUDFLARE_ACCOUNT_ID": "your-account-id"
  }
}
```

### 7. Set Secrets

Set the required secrets using Wrangler:

```bash
wrangler secret put R2_SOURCE_BUCKET
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret put CLOUDFLARE_API_TOKEN
```

### 8. Configure R2 Event Notifications

Set up R2 to send notifications to your queue when objects are created:

1. Go to Cloudflare Dashboard → R2 → Your Bucket → Settings
2. Create an Event Notification:
   - **Event types**: Object Create (Put)
   - **Destination**: Queue
   - **Queue**: `video-processing-queue`

Alternatively, use Wrangler:

```bash
wrangler r2 bucket notification create your-source-bucket \
  --event-type object-create \
  --queue video-processing-queue
```

## Deployment

### Deploy to Production
```bash
wrangler deploy
```

### Deploy to Development/Preview
```bash
wrangler deploy --env preview
```

## Usage

1. **Upload a video file to your R2 bucket**:
   ```bash
   wrangler r2 object put your-source-bucket/video.mp4 --file ./video.mp4
   ```

2. **The system will automatically**:
   - Detect the new file via R2 event notification
   - Generate a presigned URL for the file
   - Create a Stream video asset using the presigned URL
   - Store the Stream URL mapping in KV

3. **Retrieve Stream URLs**:
   ```bash
   wrangler kv:key get "video.mp4" --binding STREAM_URLS
   ```

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `R2_SOURCE_BUCKET` | R2 bucket binding for source videos | ✅ |
| `R2_ACCESS_KEY_ID` | R2 API access key ID | ✅ |
| `R2_SECRET_ACCESS_KEY` | R2 API secret access key | ✅ |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | ✅ |
| `CLOUDFLARE_API_TOKEN` | API token with Stream permissions | ✅ |

## Development

### Local Development
```bash
pnpm run dev
```

### Running Tests
```bash
pnpm test
```

### Type Generation
```bash
pnpm run cf-typegen
```
