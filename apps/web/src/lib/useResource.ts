import { useCallback, useEffect, useRef, useState } from 'react';
import type { Static, TSchema } from 'typebox';
import { ApiClientError } from './api.js';
import { api } from './client.js';

export function useResource<T extends TSchema>(url: string | null, schema: T, onExpired: () => void, retainOnReload=false) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; url:string; value?: Static<T>; error?: unknown }>();
  const generation = useRef(0);
  const key = `${url ?? ''}:${revision}`;
  useEffect(() => {
    const current = ++generation.current;
    if (!url) return;
    const controller = new AbortController();
    void api(url, schema, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted && current === generation.current) setState({ key, url, value });
    }, (error: unknown) => {
      if (controller.signal.aborted || current !== generation.current) return;
      if (error instanceof ApiClientError && error.status === 401) onExpired();
      else setState(previous=>({key,url,error,...(retainOnReload&&previous?.url===url&&previous.value?{value:previous.value}:{})}));
    });
    return () => { controller.abort(); };
  }, [url, schema, key, onExpired,retainOnReload]);
  const reload = useCallback(() => { setRevision((value) => value + 1); }, []);
  return { ...(state?.key === key ? state : {}), ...(retainOnReload&&state?.url===url&&state.value?{value:state.value}:{}), loading: !!url && state?.key !== key, reload };
}
