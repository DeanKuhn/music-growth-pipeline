import { NextResponse } from 'next/server';

export class ValidationError extends Error {}

// 400s return this generic message, never the zod error tree — the tree
// describes the API surface (field names, enum values, formats).
export function badRequest() {
  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}

export function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

// Catch-all for anything unexpected reaching a route handler (Postgres
// errors included). The Postgres detail — table/column names, constraint
// names — is logged server-side only and never reaches the response body.
export function serverError(cause: unknown) {
  const requestId = crypto.randomUUID();
  console.error(`[${requestId}]`, cause);
  return NextResponse.json({ error: 'Internal error', requestId }, { status: 500 });
}
