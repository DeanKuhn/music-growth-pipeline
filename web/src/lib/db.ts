import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL_READONLY;

if (!connectionString) {
  throw new Error('DATABASE_URL_READONLY is not set');
}

if (process.env.DATABASE_URL && connectionString === process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL_READONLY must not equal the owner DATABASE_URL — refusing to start with write credentials.'
  );
}

export const sql = postgres(connectionString, { max: 10 });

const EXPECTED_ROLE = 'app_readonly';

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
