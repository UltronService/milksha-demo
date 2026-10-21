import { ConfigProvider } from 'antd';
import zhTW from 'antd/locale/zh_TW';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('missing #root');
}

createRoot(rootEl).render(
  <StrictMode>
    <ConfigProvider locale={zhTW}>
      <App />
    </ConfigProvider>
  </StrictMode>,
);
