## Media storage (S3-compatible, DigitalOcean Spaces)

This backend supports private media storage using presigned URLs. The client requests an upload URL, uploads directly to Spaces, then creates a DB record.

### Endpoints

1) Presign upload URL
`POST /api/media/presign`

Request body:
```json
{
	"flashcardId": 123,
	"type": "SCREENSHOT",
	"fileName": "example.png",
	"contentType": "image/png",
	"size": 34567
}
```

Response:
```json
{
	"status": "success",
	"data": {
		"uploadUrl": "https://...",
		"objectKey": "media/1/123/screenshot/uuid_example.png",
		"expiresAt": "2026-05-02T12:00:00Z"
	},
	"timestamp": "2026-05-02T11:50:00"
}
```

2) Upload to Spaces (direct PUT)
```bash
curl -X PUT "<uploadUrl>" \
	-H "Content-Type: image/png" \
	--data-binary "@example.png"
```

3) Create media record
`POST /api/media`

Request body:
```json
{
	"flashcardId": 123,
	"type": "SCREENSHOT",
	"objectKey": "media/1/123/screenshot/uuid_example.png",
	"originalFileName": "example.png",
	"contentType": "image/png",
	"size": 34567
}
```

4) Get download URL
`GET /api/media/{mediaId}/url`

Response:
```json
{
	"status": "success",
	"data": {
		"downloadUrl": "https://...",
		"expiresAt": "2026-05-02T12:05:00Z"
	},
	"timestamp": "2026-05-02T11:55:00"
}
```

### Required config (application.yml)
```
storage:
	s3:
		region: nyc3
		endpoint: https://nyc3.digitaloceanspaces.com
		bucket: syntagma-dev
		access-key: <DO_SPACES_KEY>
		secret-key: <DO_SPACES_SECRET>
		presign-expiration-minutes: 10
```
