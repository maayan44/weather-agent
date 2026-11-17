// Where the backend lives. Set VITE_API_URL on Vercel to the Railway address; locally it defaults to the dev server.
export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

// The backend rejects longer messages, so the composer stops them first.
export const MAX_MESSAGE_LENGTH = 1000;

// A chat can take a while (up to about 2 minutes in the worst case on the backend).
export const CHAT_TIMEOUT_MS = 130_000;
