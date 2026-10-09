// Imported first by main.tsx: runs before any module reads the locale
import { adoptLegacyLocaleCookie } from './locale-cookie';

if (typeof document !== 'undefined') adoptLegacyLocaleCookie(document);
