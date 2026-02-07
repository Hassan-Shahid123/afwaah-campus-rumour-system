// ─────────────────────────────────────────────────────────────
// Vercel Serverless Function — wraps the Express API server
// Vercel routes /api/* requests to this handler.
// ─────────────────────────────────────────────────────────────
import app from '../backend/src/server.js';

export default app;
