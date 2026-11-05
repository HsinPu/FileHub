import { useEffect, useRef, useState } from 'react';
import { Button, Spin } from 'antd';
import type { ResourceMetadata } from '@filehub/contracts';
import { ApiClientError } from '../../lib/api.js';
import { previewBytes } from './binary.js';
import { ThumbnailQueue } from './queue.js';
import { FileIcon } from '../files/FileIcon.js';

const queue = new ThumbnailQueue();
export function Thumbnail({ entry, resource, open, onExpired }: { entry: string; resource: ResourceMetadata; open(): void; onExpired(): void }) {
  const container = useRef<HTMLDivElement>(null), [visible, setVisible] = useState(false), [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ image?: string; error?: boolean }>({});
  const candidate = resource.canDownload && /\.(?:png|jpe?g|webp)$/i.test(resource.name);
  const url = `/api/entries/${entry}/preview/thumbnail?${new URLSearchParams({ path: resource.path, version: resource.version })}`;
  useEffect(() => {
    const element = container.current; if (!element || !candidate) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((item) => item.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '100px' });
    observer.observe(element); return () => observer.disconnect();
  }, [candidate]);
  useEffect(() => {
    if (!candidate || !visible) return;
    const controller = new AbortController(), deadline = AbortSignal.timeout(12000), signal = AbortSignal.any([controller.signal, deadline]);
    let objectUrl: string | undefined;
    setState({});
    void queue.run(() => previewBytes(url, signal, 262144), signal).then(({ bytes, mime }) => {
      if (signal.aborted) return;
      if (mime !== 'image/jpeg') throw new Error();
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime })); setState({ image: objectUrl });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiClientError && error.status === 401) { queue.clear(); onExpired(); }
      else setState({ error: true });
    });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, candidate, visible, attempt, onExpired]);
  return <div ref={container} className="thumbnail-image">
    <Button type="text" className="thumbnail-open" aria-label={`${resource.canBrowse ? '開啟' : '預覽'} ${resource.name}`} disabled={!resource.canBrowse && !resource.canDownload} onClick={open}>
      {state.image ? <img src={state.image} alt={`${resource.name} 縮圖`} onError={() => { setState({ error: true }); }}/> : candidate && visible && !state.error ? <Spin size="small"/> : <FileIcon resource={resource}/>}
    </Button>
    {state.error && <div className="thumbnail-failure"><span>無法載入縮圖</span><Button size="small" aria-label={`重試縮圖 ${resource.name}`} onClick={() => { setAttempt((value) => value + 1); }}>重試</Button></div>}
  </div>;
}
