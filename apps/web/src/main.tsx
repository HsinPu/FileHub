import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import { App } from './app/App.js';
import { Providers } from './app/Providers.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('找不到 FileHub 掛載點。');
createRoot(root).render(<StrictMode><Providers><App/></Providers></StrictMode>);
