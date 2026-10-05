import { getPath } from './routes/paths';
import { getApiBaseUrl } from './utils/capacitor';

export const API_BASE_URL = getApiBaseUrl();
export const PATH_AFTER_LOGIN = getPath(['dashboard']);

/**
 * Socket.IO URL of a namespace. With a relative API URL (the Docker image's
 * /api proxy), sockets go through the page's own origin, whose /socket.io
 * path reaches the API.
 */
export function socketUrl(namespace: string): string {
  const base = API_BASE_URL.startsWith('/')
    ? window.location.origin
    : API_BASE_URL;
  return `${base}/${namespace}`;
}
