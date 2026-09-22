import { useEffect, useRef, useState } from "react";
import {
  api,
  errorMessage,
  listingSchema,
  navigationSchema,
  type DirectoryNavigation,
  type FileEntry,
} from "../../lib/api";

export function useDirectoryListing(
  path: string,
  enabled: boolean,
  revision: number,
  onError: () => void,
) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const key = JSON.stringify([path, revision]);
  const [state, setState] = useState<{
    entries: FileEntry[];
    permissions: string[];
    navigation: DirectoryNavigation;
    loadedPath: string | null;
    key: string | null;
    loading: boolean;
    error: string | null;
  }>({
    entries: [],
    permissions: [],
    navigation: navigationSchema.parse({}),
    loadedPath: null,
    key: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    if (!enabled) {
      setState((previous) => ({
        ...previous,
        key: null,
        permissions: [],
        loading: false,
      }));
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({
      ...previous,
      key: null,
      permissions: [],
      loading: true,
      error: null,
    }));
    api("/files?path=" + encodeURIComponent(path), listingSchema, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted)
          setState({
            entries: result.entries,
            permissions: result.permissions,
            navigation: result,
            loadedPath: result.path,
            key,
            loading: false,
            error: null,
          });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setState({
          entries: [],
          permissions: [],
          navigation: navigationSchema.parse({}),
          loadedPath: null,
          key,
          loading: false,
          error: errorMessage(reason),
        });
        onErrorRef.current();
      });
    return () => controller.abort();
  }, [path, enabled, revision, key]);
  const loading = enabled && (state.loading || state.key !== key);
  return {
    entries: state.entries,
    loadedPath: state.loadedPath,
    navigation: state.navigation,
    directoryPermissions:
      enabled && !loading && !state.error ? state.permissions : [],
    loading,
    error: state.error,
  };
}
