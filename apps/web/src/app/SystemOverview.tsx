import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Spin, Tag } from 'antd';
import { PublicShell } from './PublicShell.js';
import { ToolIcon } from './ToolIcon.js';
import { ApiClientError, getReadiness } from '../lib/api.js';

type Status = { state: 'checking' | 'ready' | 'not_ready' } | { state: 'error'; error: ApiClientError };
const labels = { checking: '檢查中', ready: '已就緒', not_ready: '尚未就緒', error: '連線異常' };

export function SystemOverview() {
  const [status, setStatus] = useState<Status>({ state: 'checking' });
  const active = useRef<AbortController | undefined>(undefined);
  const reload = useCallback(() => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setStatus({ state: 'checking' });
    void getReadiness({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setStatus({ state: result.status });
    }, (error: unknown) => {
      if (!controller.signal.aborted) setStatus({ state: 'error', error: error instanceof ApiClientError ? error : new ApiClientError('network') });
    });
  }, []);
  useEffect(() => { reload(); return () => active.current?.abort(); }, [reload]);
  const descriptions = {
    checking: '正在確認服務是否可用，請稍候。', ready: 'API 與資料庫正常回應。',
    not_ready: '服務目前尚未準備完成，請稍後重新檢查。', error: '目前無法確認服務狀態，請重新檢查。',
  };

  return <div className="public-status"><PublicShell label="服務狀態" links={[{name:'系統概覽',href:'#overview',icon:'info'},{name:'開發進度',href:'#scope',icon:'files'}]}>
        <section id="overview" aria-labelledby="overview-title">
          <div className="page-heading"><p className="eyebrow">FILEHUB WORKSPACE</p><h1 id="overview-title">系統概覽</h1><p>檢查服務連線，確認目前可用的功能。</p></div>
          <section className="status-panel" aria-labelledby="connection-title">
            <div className="panel-heading"><h2 id="connection-title">服務連線</h2><Tag color={status.state === 'ready' ? 'success' : status.state === 'error' ? 'error' : status.state === 'not_ready' ? 'warning' : 'default'}>{labels[status.state]}</Tag></div>
            <div className="connection-body">
              <div className="connection-summary" role="status" aria-live="polite" aria-atomic="true">
                <span className={`connection-icon ${status.state}`}>{status.state === 'checking' ? <Spin size="small"/> : <ToolIcon name={status.state==='ready'?'check':status.state==='not_ready'?'info':'error'}/>}</span>
                <div><h3>{status.state === 'ready' ? '服務已就緒' : status.state === 'checking' ? '正在檢查服務' : status.state === 'not_ready' ? '服務尚未就緒' : '暫時無法取得服務狀態'}</h3><p>{descriptions[status.state]}</p></div>
              </div>
              <Button type="primary" aria-label="重新檢查" aria-busy={status.state==='checking'} icon={<ToolIcon name="refresh"/>} loading={status.state === 'checking'} disabled={status.state === 'checking'} onClick={reload}>重新檢查</Button>
            </div>
            {status.state === 'error' && <div className="error-details"><Alert type="error" showIcon title={status.error.message} description={status.error.requestId ? `問題編號：${status.error.requestId}` : undefined}/></div>}
            <div className="panel-footnote">此處顯示最近一次檢查的結果。</div>
          </section>
        </section>
        <section id="scope" className="scope-section" aria-labelledby="scope-title">
          <div className="section-heading"><div><h2 id="scope-title">開發進度</h2><p>逐步建立可靠的檔案工作空間。</p></div><span className="phase-label">功能概覽</span></div>
          <div className="scope-list">
            <div className="scope-row"><span className="step-number">01</span><div><h3>基礎環境</h3><p>服務狀態檢查與基本介面已建立。</p></div><Tag color="blue">已建立</Tag></div>
            <div className="scope-row"><span className="step-number">02</span><div><h3>登入與檔案瀏覽</h3><p>確認身分與存取權限後，瀏覽及下載檔案。</p></div><Tag color="blue">已建立</Tag></div>
            <div className="scope-row"><span className="step-number">03</span><div><h3>檔案管理</h3><p>依服務設定與權限提供上傳、整理、搜尋、預覽與分享。</p></div><Tag color="blue">已建立</Tag></div>
          </div>
          <p className="development-notice">登入後可依權限瀏覽、下載與管理檔案；分享連結提供獨立存取。<a href="/">返回檔案工作空間</a></p>
        </section>
</PublicShell></div>;
}
