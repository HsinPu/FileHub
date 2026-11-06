export const FILEHUB_MOUNT_PATH = '/FileHub';

export function fileHubMountPrefix(path: string): '' | typeof FILEHUB_MOUNT_PATH {
  return path.startsWith(`${FILEHUB_MOUNT_PATH}/`) ? FILEHUB_MOUNT_PATH : '';
}
