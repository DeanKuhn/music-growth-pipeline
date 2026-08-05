import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL_READONLY;

if (!connectionString) {
  throw new Error('DATABASE_URL_READONLY is not set');
}

if (process.env.DATABASE_URL && connectionString === process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL_READONLY must not equal the owner DATABASE_URL — refusing to start with write credentials.'
  );
}

// Tagged-template only. Never call sql(str) as a plain function — see
// .eslintrc.json's no-restricted-syntax rule, which enforces this statically.
export const sql = neon(connectionString);

const EXPECTED_ROLE = 'app_readonly';

// The literal-equality check above only catches DATABASE_URL_READONLY being
// byte-identical to DATABASE_URL. It can't catch a *different* connection
// string that still authenticates as the owner (e.g. the wrong role's
// string copied from the Neon dashboard) — that mistake connects fine and
// silently grants write access. Verify the actual connected role instead.
// Memoized per warm instance so it costs one extra query, not one per
// request.
let roleCheck: Promise<void> | null = null;

export function assertReadonlyRole(): Promise<void> {
  if (!roleCheck) {
    roleCheck = (async () => {
      const rows = await sql`select current_user as role`;
      const role = rows[0]?.role;
      if (role !== EXPECTED_ROLE) {
        throw new Error(
          `DATABASE_URL_READONLY connected as '${role}', expected '${EXPECTED_ROLE}' — refusing to serve with unexpected DB privileges.`
        );
      }
    })();
  }
  return roleCheck;
}
