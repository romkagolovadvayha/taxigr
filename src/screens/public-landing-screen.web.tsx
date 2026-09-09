import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";

import "./public-landing.css";

const steps = [
  {
    title: "Скажите, куда едем",
    text: "Выберите адрес или отметьте точку на карте. Место подачи можно определить по геолокации — с вашего разрешения.",
    image: "app-home",
    detail: "Начните с двух адресов",
    alt: "Экран приложения: поля «Откуда» и «Куда», тарифы «Эконом» и «Детский».",
  },
  {
    title: "Посмотрите стоимость",
    text: "Маршрут, расчётная цена и время подачи появятся до подтверждения. Выберите тариф и добавьте комментарий водителю.",
    image: "app-route",
    detail: "Все детали — до заказа",
    alt: "Экран расчёта поездки по Грахово с маршрутом на карте, тарифами и стоимостью.",
  },
  {
    title: "Встречайте свою машину",
    text: "Когда водитель примет заказ, вы увидите его имя, автомобиль и номер. Следите за поездкой на карте, звоните или пишите в чат.",
    image: "app-driver",
    detail: "Вы знаете, кто приедет",
    alt: "Экран назначенного водителя: имя, автомобиль, государственный номер и кнопки связи.",
  },
] as const;

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h16m-6-6 6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Icon({
  kind,
}: {
  kind: "pin" | "check" | "shield" | "chat" | "pause" | "play";
}) {
  const paths = {
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    chat: (
      <>
        <path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z" />
        <path d="M7 9h9M7 13h6" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8V4Z" />,
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`lp-brand${light ? " lp-brand-light" : ""}`}>
      <img src="/logo.svg" width="38" height="38" alt="" />
      <span>
        Такси Грахово
        <span className="lp-brand-caption">Знакомые дороги. Близкие люди.</span>
      </span>
    </span>
  );
}

function Phone({
  image,
  alt,
  eager = false,
}: {
  image: string;
  alt: string;
  eager?: boolean;
}) {
  return (
    <div className="lp-phone">
      <div className="lp-phone-speaker" aria-hidden="true" />
      <img
        className="lp-phone-screen"
        src={`/landing/${image}.webp`}
        alt={alt}
        width="780"
        height="1688"
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
      <span className="lp-phone-home" aria-hidden="true" />
    </div>
  );
}

function useLandingMotion(paused: boolean) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const visual = element.querySelector<HTMLElement>(".lp-hero-visual");
    const reset = () => {
      element.style.setProperty("--lp-tilt-x", "0deg");
      element.style.setProperty("--lp-tilt-y", "0deg");
      element.style.setProperty("--lp-scroll", "0px");
    };
    const move = (event: PointerEvent) => {
      if (
        paused ||
        preference.matches ||
        event.pointerType !== "mouse" ||
        !visual
      )
        return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = visual.getBoundingClientRect();
        element.style.setProperty(
          "--lp-tilt-y",
          `${((event.clientX - box.left) / box.width - 0.5) * 10}deg`,
        );
        element.style.setProperty(
          "--lp-tilt-x",
          `${-((event.clientY - box.top) / box.height - 0.5) * 7}deg`,
        );
      });
    };
    const scroll = () => {
      if (paused || preference.matches) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        element.style.setProperty(
          "--lp-scroll",
          `${Math.min(element.scrollTop * 0.12, 72)}px`,
        ),
      );
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  entry.target.classList.add("lp-visible");
                  observer?.unobserve(entry.target);
                }
              });
            },
            { root: element, threshold: 0.12 },
          );
    if (observer) {
      element.setAttribute("data-enhanced", "true");
      element
        .querySelectorAll("[data-reveal]")
        .forEach((section) => observer.observe(section));
    }
    reset();
    visual?.addEventListener("pointermove", move, { passive: true });
    visual?.addEventListener("pointerleave", reset);
    element.addEventListener("scroll", scroll, { passive: true });
    preference.addEventListener?.("change", reset);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      visual?.removeEventListener("pointermove", move);
      visual?.removeEventListener("pointerleave", reset);
      element.removeEventListener("scroll", scroll);
      preference.removeEventListener?.("change", reset);
    };
  }, [paused]);
  return root;
}

export function PublicLandingScreen() {
  const [step, setStep] = useState(1);
  const [tariff, setTariff] = useState<"economy" | "child">("economy");
  const [paused, setPaused] = useState(false);
  const root = useLandingMotion(paused);
  const selectedStep = steps[step]!;

  return (
    <div className="lp" ref={root} data-paused={paused}>
      <a className="lp-skip" href="#main">
        К содержанию
      </a>
      <header className="lp-header lp-wrap">
        <a href="#main" aria-label="Такси Грахово — главная">
          <Brand />
        </a>
        <nav className="lp-nav" aria-label="Главная навигация">
          <a href="#how">Как это работает</a>
          <a href="#tariffs">Тарифы</a>
          <a href="#drivers">Водителям</a>
        </nav>
        <Link href="/sign-in" className="lp-header-login">
          Войти <Arrow diagonal />
        </Link>
      </header>

      <main id="main">
        <section className="lp-hero lp-wrap" aria-labelledby="hero-heading">
          <div className="lp-hero-copy">
            <div className="lp-eyebrow">
              <span className="lp-live-dot" /> ГРАХОВО И РЯДОМ
            </div>
            <h1 id="hero-heading">
              Свои дороги.
              <br />
              <span>Своё такси.</span>
            </h1>
            <p className="lp-lead">
              В гости, по делам или домой.
              <br />
              Укажите маршрут — всё остальное
              <br className="lp-desktop-break" /> будет на экране.
            </p>
            <div className="lp-hero-actions">
              <Link href="/sign-in" className="lp-button lp-primary">
                Заказать такси <Arrow />
              </Link>
              <a className="lp-text-link" href="#how">
                <span className="lp-play-circle">
                  <Icon kind="play" />
                </span>
                Как это работает
              </a>
            </div>
            <div className="lp-hero-proof">
              <span className="lp-proof-icon">
                <Icon kind="check" />
              </span>
              <div>
                <strong>Без комиссии для пассажиров</strong>
                <span>И без обязательной установки приложения</span>
              </div>
            </div>
          </div>
          <div
            className="lp-hero-visual"
            aria-label="Пример заказа такси в приложении"
          >
            <div className="lp-orbit lp-orbit-one" aria-hidden="true" />
            <div className="lp-orbit lp-orbit-two" aria-hidden="true" />
            <span
              className="lp-coordinate lp-coordinate-top"
              aria-hidden="true"
            >
              56.0476° N · 51.9584° E
            </span>
            <div className="lp-hero-scene">
              <div className="lp-phone-float">
                <Phone image="app-route" alt={steps[1].alt} eager />
              </div>
            </div>
            <div className="lp-float-label lp-route-label">
              <span className="lp-small-pin">
                <Icon kind="pin" />
              </span>
              <div>
                <strong>Знакомый маршрут</strong>
                <span>Всё начинается с вашей точки</span>
              </div>
            </div>
            <div className="lp-magnifier-group">
              <div
                className="lp-magnifier"
                role="img"
                aria-label="Увеличенный фрагмент: тарифы и расчётная стоимость до подтверждения заказа"
              >
                <div className="lp-magnifier-image" />
              </div>
              <span className="lp-lens-caption">
                <span />
                Цена до поездки
              </span>
            </div>
            <span className="lp-visual-note">
              Настоящий интерфейс · пример поездки
            </span>
          </div>
        </section>

        <div className="lp-facts lp-wrap" aria-label="Возможности сервиса">
          <div>
            <span>01</span>
            <strong>Адрес — в пару касаний</strong>
          </div>
          <div>
            <span>02</span>
            <strong>Стоимость — до заказа</strong>
          </div>
          <div>
            <span>03</span>
            <strong>Водитель — на карте</strong>
          </div>
          <a href="#how" aria-label="Узнать подробнее о заказе">
            ↓
          </a>
        </div>

        <section
          id="how"
          className="lp-how lp-wrap lp-section"
          data-reveal
          aria-labelledby="how-heading"
        >
          <div className="lp-section-heading">
            <div>
              <p className="lp-eyebrow">ПОНЯТНО С ПЕРВОГО КАСАНИЯ</p>
              <h2 id="how-heading">
                Меньше вопросов.
                <br />
                <span>Ближе к поездке.</span>
              </h2>
            </div>
            <p>
              Никаких сложных инструкций.
              <br />
              Посмотрите, как устроен ваш заказ.
            </p>
          </div>
          <div className="lp-how-grid">
            <div
              className="lp-step-list"
              role="group"
              aria-label="Этапы заказа такси"
            >
              {steps.map((item, index) => (
                <button
                  key={item.title}
                  className={`lp-step${step === index ? " lp-step-active" : ""}`}
                  aria-pressed={step === index}
                  aria-controls="trip-preview"
                  onClick={() => setStep(index)}
                >
                  <span className="lp-step-number">0{index + 1}</span>
                  <span className="lp-step-copy">
                    <strong>{item.title}</strong>
                    <span>{item.text}</span>
                  </span>
                  <span className="lp-step-arrow">
                    <Arrow />
                  </span>
                </button>
              ))}
              <p className="lp-small-note">
                Нажмите на шаг, чтобы посмотреть экран.
              </p>
            </div>
            <div
              className="lp-step-visual"
              id="trip-preview"
              role="region"
              aria-label="Пример экрана выбранного этапа"
            >
              <div className="lp-step-circle" aria-hidden="true" />
              <span className="lp-step-watermark" aria-hidden="true">
                0{step + 1}
              </span>
              <div className="lp-step-phone" key={selectedStep.image}>
                <Phone image={selectedStep.image} alt={selectedStep.alt} />
              </div>
              <div className="lp-step-detail" aria-live="polite">
                <Icon kind="check" />
                {selectedStep.detail}
              </div>
            </div>
          </div>
        </section>

        <section
          id="tariffs"
          className="lp-tariffs lp-wrap lp-section"
          data-reveal
          aria-labelledby="tariffs-heading"
        >
          <div className="lp-section-heading">
            <div>
              <p className="lp-eyebrow">ПОД ВАШИ ПЛАНЫ</p>
              <h2 id="tariffs-heading">
                Одному. Вместе.
                <br />
                <span>С самым важным.</span>
              </h2>
            </div>
            <p>
              Два понятных тарифа.
              <br />
              Выберите свой перед заказом.
            </p>
          </div>
          <div className="lp-tariff-grid">
            <div className="lp-tariff-showcase">
              <div
                className="lp-tariff-switch"
                role="group"
                aria-label="Посмотреть тариф"
              >
                <button
                  aria-pressed={tariff === "economy"}
                  onClick={() => setTariff("economy")}
                >
                  Эконом
                </button>
                <button
                  aria-pressed={tariff === "child"}
                  onClick={() => setTariff("child")}
                >
                  Детский
                </button>
              </div>
              <div className="lp-tariff-art" key={tariff}>
                <span className="lp-tariff-backdrop" aria-hidden="true">
                  {tariff === "economy" ? "ПО ДЕЛАМ" : "С ЗАБОТОЙ"}
                </span>
                <img
                  src={`/landing/${tariff === "economy" ? "economy-car" : "child-seat"}.webp`}
                  alt={
                    tariff === "economy"
                      ? "Иллюстрация автомобиля тарифа «Эконом»"
                      : "Иллюстрация детского автомобильного кресла"
                  }
                  width="600"
                  height="400"
                  loading="lazy"
                />
              </div>
              <div className="lp-tariff-copy" aria-live="polite">
                <h3>
                  {tariff === "economy"
                    ? "На каждый день"
                    : "Для маленьких пассажиров"}
                </h3>
                <p>
                  {tariff === "economy"
                    ? "За покупками, на работу, к друзьям. Привычные поездки — с понятным заказом."
                    : "Машина с подходящим детским креслом. Выберите «Детский», чтобы водитель приехал подготовленным."}
                </p>
              </div>
              <Link href="/sign-in" className="lp-tariff-link">
                Выбрать в приложении <Arrow diagonal />
              </Link>
            </div>
            <div className="lp-clarity-card">
              <div className="lp-clarity-top">
                <span className="lp-mini-label">ПРОСТО И ПРОЗРАЧНО</span>
                <Icon kind="shield" />
              </div>
              <div className="lp-zero">
                0<span>%</span>
              </div>
              <h3>
                Комиссии
                <br />
                для пассажиров.
              </h3>
              <p>
                Расчётная стоимость видна до подтверждения. Оплата — наличными
                водителю после поездки.
              </p>
              <div className="lp-clarity-footer">
                <Icon kind="check" />
                <span>Все детали в одном месте</span>
              </div>
            </div>
          </div>
        </section>

        <section
          className="lp-local lp-wrap lp-section"
          data-reveal
          aria-labelledby="local-heading"
        >
          <div className="lp-local-copy">
            <p className="lp-eyebrow">БЛИЖЕ, ЧЕМ КАЖЕТСЯ</p>
            <h2 id="local-heading">
              Здесь знают
              <br />
              <span>ваши дороги.</span>
            </h2>
            <p>
              Такси Грахово объединяет местных пассажиров и водителей. По селу,
              в соседнюю деревню или дальше — задайте маршрут в приложении.
            </p>
            <div className="lp-places">
              <span>
                <i />
                Грахово
              </span>
              <span>Граховский район</span>
              <span>
                Поездки дальше <Arrow diagonal />
              </span>
            </div>
            <p className="lp-small-note">
              Возможность поездки зависит от маршрута и свободных водителей.
            </p>
          </div>
          <div className="lp-local-art">
            <img
              src="/landing/local-roads.webp"
              alt="Объёмная иллюстрация: жёлтое такси на маршруте между домами небольшого села"
              width="1536"
              height="1024"
              loading="lazy"
            />
            <span className="lp-local-label">
              <Icon kind="pin" />
              Ваше такси рядом
            </span>
          </div>
        </section>

        <section
          id="drivers"
          className="lp-driver lp-wrap"
          data-reveal
          aria-labelledby="driver-heading"
        >
          <div className="lp-driver-symbol" aria-hidden="true">
            <img src="/logo.svg" width="94" height="94" alt="" />
          </div>
          <div className="lp-driver-copy">
            <p className="lp-eyebrow">ЗА РУЛЁМ? ВАМ К НАМ</p>
            <h2 id="driver-heading">
              Работайте там,
              <br />
              где всё знакомо.
            </h2>
            <p>
              Подайте заявку из профиля. После проверки документов получайте
              заказы и отслеживайте доход в приложении.
            </p>
          </div>
          <Link href="/sign-in" className="lp-button lp-white">
            Стать водителем <Arrow diagonal />
          </Link>
        </section>

        <section
          className="lp-faq lp-wrap lp-section"
          data-reveal
          aria-labelledby="faq-heading"
        >
          <div>
            <p className="lp-eyebrow">ЕЩЁ ПАРА ДЕТАЛЕЙ</p>
            <h2 id="faq-heading">
              Всё просто.
              <br />
              <span>И по делу.</span>
            </h2>
          </div>
          <div className="lp-faq-list">
            <details>
              <summary>
                Нужно устанавливать приложение?<span>+</span>
              </summary>
              <p>
                Можно заказать прямо на этом сайте — с телефона или компьютера.
                Нажмите «Заказать такси» и войдите по номеру телефона.
              </p>
            </details>
            <details>
              <summary>
                Как узнать стоимость поездки?<span>+</span>
              </summary>
              <p>
                Укажите место подачи и адрес назначения. Приложение покажет
                расчётную стоимость и время подачи до подтверждения заказа.
              </p>
            </details>
            <details>
              <summary>
                Можно поехать с ребёнком?<span>+</span>
              </summary>
              <p>
                Да. Выберите тариф «Детский» — заказ получит водитель с
                подходящим детским креслом.
              </p>
            </details>
            <details>
              <summary>
                Как найти водителя после заказа?<span>+</span>
              </summary>
              <p>
                После принятия заказа в приложении появятся имя водителя, марка
                машины, цвет и государственный номер. Там же можно позвонить или
                написать водителю.
              </p>
            </details>
          </div>
        </section>

        <section className="lp-final lp-wrap" data-reveal>
          <span className="lp-eyebrow">ДОМА ЖДУТ. ДЕЛА ЗОВУТ.</span>
          <h2>
            Ну что, <span>поехали?</span>
          </h2>
          <Link href="/sign-in" className="lp-button lp-primary">
            Заказать такси <Arrow />
          </Link>
          <p>Ваш следующий маршрут начинается здесь.</p>
        </section>
      </main>

      <footer className="lp-footer lp-wrap">
        <div className="lp-footer-top">
          <Brand />
          <button
            className="lp-motion-toggle"
            onClick={() => setPaused(!paused)}
            aria-pressed={paused}
          >
            <Icon kind={paused ? "play" : "pause"} />
            {paused ? "Включить анимацию" : "Остановить анимацию"}
          </button>
        </div>
        <div className="lp-footer-links">
          <Link href="/legal">Правовые документы</Link>
          <Link href="/privacy">Персональные данные</Link>
          <Link href="/terms">Условия сервиса</Link>
          <Link href="/safety">Безопасность</Link>
        </div>
        <p>
          Такси Грахово — платформа заказа поездок. Перевозку выполняет
          одобренный независимый водитель. Время подачи зависит от доступности
          машин и дорожной обстановки. На иллюстрациях показан пример заказа, а
          не предложение поездки по указанной цене.
        </p>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} Такси Грахово</span>
          <span>Сделано для своих дорог.</span>
        </div>
      </footer>
    </div>
  );
}
