# Cloud Run Token Matcher Service

This service receives a sentence and a target word, computes the contextual token embedding using `@xenova/transformers`, compares it against pre-computed token embeddings stored in Firestore, and returns the ranked meanings. It is designed to run on Google Cloud Run alongside the `hahaha_vocabulary` project.

## Development

```bash
cd cloud-run-token-matcher
npm install
npm run dev
```

The service listens on `http://localhost:8080`. Health check is exposed at `/healthz`.

## Deployment (Cloud Run)

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/token-matcher
gcloud run deploy token-matcher \
  --image gcr.io/PROJECT_ID/token-matcher \
  --region REGION \
  --allow-unauthenticated
```

Replace `PROJECT_ID` and `REGION` with your Cloud project configuration. Grant the Cloud Run service account Firestore access (e.g. `roles/datastore.user`). Set min instances to `1` if you want to reduce cold-start time caused by model loading.

