import { App, cert, getApps, initializeApp } from 'firebase-admin/app';

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

/**
 * Returns the Firebase Admin app configured from FIREBASE_SERVICE_ACCOUNT_JSON,
 * initializing it on first use, or null when Firebase is not configured
 * (it is optional for self-hosted instances).
 *
 * @throws when the service account JSON is present but invalid.
 */
export function getFirebaseApp(
  serviceAccountJson: string | undefined,
): App | null {
  const [existing] = getApps();
  if (existing) {
    return existing;
  }

  if (!serviceAccountJson) {
    return null;
  }

  let parsed: ServiceAccountJson;
  try {
    parsed = JSON.parse(serviceAccountJson) as ServiceAccountJson;
  } catch {
    throw new Error(
      'Invalid FIREBASE_SERVICE_ACCOUNT_JSON (must be valid JSON)',
    );
  }

  const clientEmail = parsed.client_email;
  const privateKey = parsed.private_key?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error(
      'Invalid FIREBASE_SERVICE_ACCOUNT_JSON (missing client_email/private_key)',
    );
  }

  return initializeApp({
    credential: cert({
      projectId: parsed.project_id,
      clientEmail,
      privateKey,
    }),
  });
}
