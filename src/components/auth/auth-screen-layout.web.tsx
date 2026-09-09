import { Link } from "expo-router";
import { useEffect, useRef } from "react";

import { useAppTheme } from "@/theme/theme-provider";
import type { AuthScreenLayoutProps } from "./auth-screen-layout";
import "./auth-screen.css";

export function AuthScreenLayout({
  children,
  compact,
  keyboardOpen,
}: AuthScreenLayoutProps) {
  const { dark } = useAppTheme();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () =>
      root.current?.style.setProperty(
        "--auth-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <main
      className="auth-shell"
      ref={root}
      data-dark={dark}
      data-compact={compact}
      data-keyboard={keyboardOpen}
    >
      <aside className="auth-story" aria-label="Такси Грахово">
        <Link
          href="/"
          className="auth-brand"
          aria-label="На главную Такси Грахово"
        >
          <img src="/logo.svg" width="38" height="38" alt="" />
          <span>Такси Грахово</span>
        </Link>
        <div className="auth-story-copy">
          <p>СВОИ ДОРОГИ. СВОЁ ТАКСИ.</p>
          <h1>
            До встречи
            <br />у вашего дома.
          </h1>
          <span>
            Войдите привычным способом.
            <br />И отправляйтесь туда, где вас ждут.
          </span>
        </div>
        <img
          className="auth-story-art"
          src="/landing/local-roads.webp"
          alt=""
          width="1200"
          height="800"
        />
        <div className="auth-story-caption">
          <span className="auth-dot" />
          <span>Грахово и рядом</span>
          <span className="auth-caption-line" />
          <span>Поехали домой</span>
        </div>
      </aside>
      <div className="auth-content">
        <header className="auth-header">
          <Link
            href="/"
            className="auth-mobile-brand"
            aria-label="На главную Такси Грахово"
          >
            <img src="/logo.svg" width="32" height="32" alt="" />
            <span>Такси Грахово</span>
          </Link>
          <Link href="/" className="auth-home-link">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m14 6-6 6 6 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            На главную
          </Link>
        </header>
        <div className="auth-form-area">
          <div className="auth-form">{children}</div>
        </div>
        <footer className="auth-footnote">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path d="m8 12 3 3 5-6" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          Ваш номер — для входа и связи с водителем
        </footer>
      </div>
    </main>
  );
}
