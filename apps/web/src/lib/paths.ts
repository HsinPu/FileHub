import { fileHubMountPrefix } from '@filehub/contracts';

export function appHref(path: string): string {
  if (!path.startsWith('/') || typeof window === 'undefined') return path;
  return `${fileHubMountPrefix(window.location.pathname)}${path}`;
}
