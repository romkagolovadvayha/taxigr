import {
  ScrollViewStyleReset,
  useServerDocumentContext,
} from 'expo-router/html';
import type { PropsWithChildren } from 'react';
import { Asset } from 'expo-asset';

import { inlineTariffImageSources } from '@/components/passenger/tariff-image-sources';

export default function RootHtml({ children }: PropsWithChildren) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="ru" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        {Object.entries(inlineTariffImageSources).map(([code, source]) => (
          <link
            key={code}
            rel="preload"
            as="image"
            type="image/webp"
            href={Asset.fromModule(source).uri}
            fetchPriority="high"
          />
        ))}
        <meta name="theme-color" content="#F6C945" />
        <meta name="color-scheme" content="light dark" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Такси" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.setAttribute('data-theme-booting','true');var t=localStorage.getItem('taxi_grahovo_color_scheme');if(t==='dark')document.documentElement.setAttribute('data-app-theme','dark');if(localStorage.getItem('taxi_grahovo_session_token'))document.documentElement.setAttribute('data-session-booting','true')}catch(e){document.documentElement.setAttribute('data-theme-booting','true')}setTimeout(function(){document.documentElement.removeAttribute('data-session-booting');document.documentElement.removeAttribute('data-theme-booting');var b=document.getElementById('session-boot');if(b)b.remove()},15000)",
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              input:not([type]),
              input[type="text"],
              input[type="email"],
              input[type="tel"],
              input[type="password"],
              input[type="number"],
              input[type="search"],
              input[type="url"],
              textarea {
                outline: none;
                box-shadow: none;
              }
              #session-boot {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                align-items: center;
                justify-content: center;
                flex-direction: column;
                gap: 16px;
                padding: 24px;
                background: #F6C945;
                color: #25231E;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              }
              html[data-session-booting="true"] #session-boot,
              html[data-theme-booting="true"] #session-boot { display: flex; }
              .session-boot-title { font-size: 28px; line-height: 34px; font-weight: 600; }
              .session-boot-caption { color: #53451E; font-size: 14px; line-height: 20px; }
              .session-boot-spinner {
                width: 20px;
                height: 20px;
                border: 3px solid rgba(37, 35, 30, 0.22);
                border-top-color: #25231E;
                border-radius: 50%;
                animation: session-boot-spin .75s linear infinite;
              }
              @keyframes session-boot-spin { to { transform: rotate(360deg); } }
              @media (prefers-reduced-motion: reduce) {
                .session-boot-spinner { animation: none; }
              }
            `,
          }}
        />
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        <div id="session-boot" role="status" aria-live="polite" aria-label="Загрузка приложения">
          <svg width="76" height="76" viewBox="0 0 32 32" aria-hidden="true">
            <path
              d="M9.5 16c1.5 3.3 5 3.3 6.1 1.5 1.5-2.5 3.9-3.4 6.6-2"
              stroke="#25231E"
              strokeWidth="0.8"
              strokeLinecap="round"
              strokeDasharray="1.8 1.5"
              fill="none"
            />
            <path d="M9.5 3.8a5.3 5.3 0 00-5.3 5.3c0 4 5.3 8.2 5.3 8.2s5.3-4.2 5.3-8.2a5.3 5.3 0 00-5.3-5.3z" fill="#25231E" />
            <circle cx="9.5" cy="9.1" r="1.7" fill="#F6C945" />
            <path d="M22.2 15.5a5.3 5.3 0 00-5.3 5.3c0 4 5.3 8.2 5.3 8.2s5.3-4.2 5.3-8.2a5.3 5.3 0 00-5.3-5.3z" fill="#25231E" />
            <circle cx="22.2" cy="20.8" r="1.7" fill="#F6C945" />
          </svg>
          <div className="session-boot-title">Такси Грахово</div>
          <div className="session-boot-spinner" aria-hidden="true" />
          <div className="session-boot-caption">Загружаем приложение…</div>
        </div>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
