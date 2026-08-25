CREATE TABLE IF NOT EXISTS places (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  aliases_json JSON NOT NULL,
  category VARCHAR(32) NOT NULL,
  description TEXT NULL,
  address_label VARCHAR(255) NOT NULL,
  house_number VARCHAR(24) NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  phone VARCHAR(64) NULL,
  website TEXT NULL,
  social_links_json JSON NOT NULL,
  photo_urls_json JSON NOT NULL,
  schedule_json JSON NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  source_name VARCHAR(120) NULL,
  source_url TEXT NULL,
  source_checked_at DATE NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_place_category CHECK (category IN (
    'food','shopping','pharmacy','health','delivery','finance','government',
    'education','culture','sport','auto','services','other'
  )),
  INDEX idx_places_active_category (active, category),
  INDEX idx_places_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @empty_schedule = JSON_OBJECT(
  'mon', JSON_ARRAY(), 'tue', JSON_ARRAY(), 'wed', JSON_ARRAY(),
  'thu', JSON_ARRAY(), 'fri', JSON_ARRAY(), 'sat', JSON_ARRAY(), 'sun', JSON_ARRAY()
);
SET @all_day = JSON_OBJECT(
  'mon', JSON_ARRAY(JSON_OBJECT('opensAt','00:00','closesAt','00:00')),
  'tue', JSON_ARRAY(JSON_OBJECT('opensAt','00:00','closesAt','00:00')),
  'wed', JSON_ARRAY(JSON_OBJECT('opensAt','00:00','closesAt','00:00')),
  'thu', JSON_ARRAY(JSON_OBJECT('opensAt','00:00','closesAt','00:00')),
  'fri', JSON_ARRAY(JSON_OBJECT('opensAt','00:00','closesAt','00:00')),
  'sat', JSON_ARRAY(JSON_OBJECT('opensAt','00:00','closesAt','00:00')),
  'sun', JSON_ARRAY(JSON_OBJECT('opensAt','00:00','closesAt','00:00'))
);
SET @daily_07_19 = JSON_OBJECT(
  'mon', JSON_ARRAY(JSON_OBJECT('opensAt','07:00','closesAt','19:00')),
  'tue', JSON_ARRAY(JSON_OBJECT('opensAt','07:00','closesAt','19:00')),
  'wed', JSON_ARRAY(JSON_OBJECT('opensAt','07:00','closesAt','19:00')),
  'thu', JSON_ARRAY(JSON_OBJECT('opensAt','07:00','closesAt','19:00')),
  'fri', JSON_ARRAY(JSON_OBJECT('opensAt','07:00','closesAt','19:00')),
  'sat', JSON_ARRAY(JSON_OBJECT('opensAt','07:00','closesAt','19:00')),
  'sun', JSON_ARRAY(JSON_OBJECT('opensAt','07:00','closesAt','19:00'))
);
SET @daily_07_21 = JSON_REPLACE(@daily_07_19,
  '$.mon[0].closesAt','21:00','$.tue[0].closesAt','21:00','$.wed[0].closesAt','21:00',
  '$.thu[0].closesAt','21:00','$.fri[0].closesAt','21:00','$.sat[0].closesAt','21:00','$.sun[0].closesAt','21:00'
);
SET @daily_08_20 = JSON_REPLACE(@daily_07_19,
  '$.mon[0].opensAt','08:00','$.tue[0].opensAt','08:00','$.wed[0].opensAt','08:00',
  '$.thu[0].opensAt','08:00','$.fri[0].opensAt','08:00','$.sat[0].opensAt','08:00','$.sun[0].opensAt','08:00',
  '$.mon[0].closesAt','20:00','$.tue[0].closesAt','20:00','$.wed[0].closesAt','20:00',
  '$.thu[0].closesAt','20:00','$.fri[0].closesAt','20:00','$.sat[0].closesAt','20:00','$.sun[0].closesAt','20:00'
);
SET @daily_08_22 = JSON_REPLACE(@daily_08_20,
  '$.mon[0].closesAt','22:00','$.tue[0].closesAt','22:00','$.wed[0].closesAt','22:00',
  '$.thu[0].closesAt','22:00','$.fri[0].closesAt','22:00','$.sat[0].closesAt','22:00','$.sun[0].closesAt','22:00'
);
SET @daily_08_23 = JSON_REPLACE(@daily_08_20,
  '$.mon[0].closesAt','23:00','$.tue[0].closesAt','23:00','$.wed[0].closesAt','23:00',
  '$.thu[0].closesAt','23:00','$.fri[0].closesAt','23:00','$.sat[0].closesAt','23:00','$.sun[0].closesAt','23:00'
);
SET @daily_0830_22 = JSON_REPLACE(@daily_08_22,
  '$.mon[0].opensAt','08:30','$.tue[0].opensAt','08:30','$.wed[0].opensAt','08:30',
  '$.thu[0].opensAt','08:30','$.fri[0].opensAt','08:30','$.sat[0].opensAt','08:30','$.sun[0].opensAt','08:30'
);
SET @daily_09_18 = JSON_REPLACE(@daily_07_19,
  '$.mon[0].opensAt','09:00','$.tue[0].opensAt','09:00','$.wed[0].opensAt','09:00',
  '$.thu[0].opensAt','09:00','$.fri[0].opensAt','09:00','$.sat[0].opensAt','09:00','$.sun[0].opensAt','09:00',
  '$.mon[0].closesAt','18:00','$.tue[0].closesAt','18:00','$.wed[0].closesAt','18:00',
  '$.thu[0].closesAt','18:00','$.fri[0].closesAt','18:00','$.sat[0].closesAt','18:00','$.sun[0].closesAt','18:00'
);
SET @daily_09_21 = JSON_REPLACE(@daily_09_18,
  '$.mon[0].closesAt','21:00','$.tue[0].closesAt','21:00','$.wed[0].closesAt','21:00',
  '$.thu[0].closesAt','21:00','$.fri[0].closesAt','21:00','$.sat[0].closesAt','21:00','$.sun[0].closesAt','21:00'
);
SET @daily_09_22 = JSON_REPLACE(@daily_09_18,
  '$.mon[0].closesAt','22:00','$.tue[0].closesAt','22:00','$.wed[0].closesAt','22:00',
  '$.thu[0].closesAt','22:00','$.fri[0].closesAt','22:00','$.sat[0].closesAt','22:00','$.sun[0].closesAt','22:00'
);
SET @daily_10_21 = JSON_REPLACE(@daily_09_21,
  '$.mon[0].opensAt','10:00','$.tue[0].opensAt','10:00','$.wed[0].opensAt','10:00',
  '$.thu[0].opensAt','10:00','$.fri[0].opensAt','10:00','$.sat[0].opensAt','10:00','$.sun[0].opensAt','10:00'
);
SET @daily_11_23 = JSON_REPLACE(@daily_09_21,
  '$.mon[0].opensAt','11:00','$.tue[0].opensAt','11:00','$.wed[0].opensAt','11:00',
  '$.thu[0].opensAt','11:00','$.fri[0].opensAt','11:00','$.sat[0].opensAt','11:00','$.sun[0].opensAt','11:00',
  '$.mon[0].closesAt','23:00','$.tue[0].closesAt','23:00','$.wed[0].closesAt','23:00',
  '$.thu[0].closesAt','23:00','$.fri[0].closesAt','23:00','$.sat[0].closesAt','23:00','$.sun[0].closesAt','23:00'
);

INSERT INTO places
  (id, name, aliases_json, category, description, address_label, house_number,
   latitude, longitude, phone, website, social_links_json, photo_urls_json,
   schedule_json, active, source_name, source_url, source_checked_at)
VALUES
  ('00000000-0000-4000-8000-194912833972','Госаптека',JSON_ARRAY('аптека','аптека на Колпакова'),'pharmacy','Лекарства и товары для здоровья.','ул. Колпакова, 16','16',56.046186,51.962641,'+7 (3412) 39-93-99','https://gosapteka18.ru/',JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/17765342/2a0000019c798a0c99440bdb2e47bff38319/L'),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'sat',JSON_ARRAY(JSON_OBJECT('opensAt','09:00','closesAt','15:00')),'sun',JSON_ARRAY(JSON_OBJECT('opensAt','09:00','closesAt','15:00'))),TRUE,'Яндекс Карты','https://yandex.com/maps/org/194912833972/','2026-08-25'),
  ('00000000-0000-4000-8000-012028946007','Госаптека',JSON_ARRAY('аптека','аптека на Гагарина'),'pharmacy','Лекарства и товары для здоровья.','ул. Гагарина, 2','2',56.049153,51.955572,'+7 (3412) 39-93-99','https://gosapteka18.ru/',JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/9849468/2a00000189bfdcecbbf889e87a54cc0cfaf2/L'),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'sat',JSON_ARRAY(JSON_OBJECT('opensAt','09:00','closesAt','16:00')),'sun',JSON_ARRAY(JSON_OBJECT('opensAt','09:00','closesAt','16:00'))),TRUE,'Яндекс Карты','https://yandex.com/maps/org/12028946007/','2026-08-25'),
  ('00000000-0000-4000-8000-034418639411','Апрель',JSON_ARRAY('аптека Апрель'),'pharmacy','Аптека и товары для здоровья.','ул. Советская, 1','1',56.043747,51.959087,NULL,'https://apteka-april.ru/',JSON_ARRAY(),JSON_ARRAY(),@daily_08_20,TRUE,'Яндекс Карты','https://yandex.com/maps/org/34418639411/','2026-08-25'),
  ('00000000-0000-4000-8000-024226176885','Аптека № 35',JSON_ARRAY('аптека 35'),'pharmacy','Аптека. Режим работы требует уточнения.','ул. Гагарина, 1А','1А',56.049490,51.955250,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'Яндекс Карты','https://yandex.com/maps/org/24226176885/','2026-08-25'),

  ('00000000-0000-4000-8000-064863530850','Пятёрочка',JSON_ARRAY('Пятерочка','5ка','пятёрка'),'shopping','Супермаркет продуктов и товаров повседневного спроса.','ул. Советская, 15А','15А',56.044885,51.962273,'8 (800) 555-55-05','https://5ka.ru/',JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/20105336/2a0000019f0e81811fd756a82eb88843d607/L'),@daily_09_22,TRUE,'Яндекс Карты','https://yandex.com/maps/org/64863530850/','2026-08-25'),
  ('00000000-0000-4000-8000-001652968290','Магнит',JSON_ARRAY('Magnit','магнит у дома'),'shopping','Супермаркет продуктов и товаров повседневного спроса.','ул. Колпакова, 2','2',56.044743,51.958487,'8 (800) 200-90-02','https://magnit.ru/',JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/18769949/2a0000019cc0ab5eef8bfdb303251dc57538/L'),@daily_0830_22,TRUE,'Яндекс Карты','https://yandex.com/maps/org/1652968290/','2026-08-25'),
  ('00000000-0000-4000-8000-044416518427','Хлебный',JSON_ARRAY('хлебный магазин','хлеб'),'shopping','Продуктовый магазин.','ул. Колпакова, 8','8',56.045284,51.960018,NULL,NULL,JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/1880508/2a0000016dc573888169ea99f5e614a66104/L'),@daily_08_22,TRUE,'Яндекс Карты','https://yandex.com/maps/org/44416518427/','2026-08-25'),
  ('00000000-0000-4000-8000-114668762965','Красное & Белое',JSON_ARRAY('Красное и Белое','КБ','алкоголь'),'shopping','Продуктовый магазин.','ул. Советская, 15А','15А',56.044850,51.962156,'+7 (922) 703-30-00','https://krasnoeibeloe.ru/',JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/5380071/2a0000017c9302edfc2688088976d8e835e3/L'),JSON_REPLACE(@daily_09_22,'$.mon[0].closesAt','22:05','$.tue[0].closesAt','22:05','$.wed[0].closesAt','22:05','$.thu[0].closesAt','22:05','$.fri[0].closesAt','22:05','$.sat[0].closesAt','22:05','$.sun[0].closesAt','22:05'),TRUE,'Яндекс Карты','https://yandex.com/maps/org/114668762965/','2026-08-25'),
  ('00000000-0000-4000-8000-025762844182','Продукты',JSON_ARRAY('магазин на Ачинцева'),'shopping','Местный продуктовый магазин.','ул. Ачинцева, 1А','1А',56.045014,51.961073,'+7 (950) 171-92-86',NULL,JSON_ARRAY(),JSON_ARRAY(),@daily_07_21,TRUE,'Яндекс Карты','https://yandex.com/maps/org/25762844182/','2026-08-25'),
  ('00000000-0000-4000-8000-072165500472','Авокадо',JSON_ARRAY('магазин Авокадо'),'shopping','Продуктовый магазин.','ул. Колпакова, 16','16',56.046250,51.962755,'+7 (927) 672-46-32',NULL,JSON_ARRAY(),JSON_ARRAY(),@daily_08_23,TRUE,'Яндекс Карты','https://yandex.com/maps/org/72165500472/','2026-08-25'),
  ('00000000-0000-4000-8000-239804830637','Звениговский',JSON_ARRAY('мясной магазин','мясо'),'shopping','Магазин мясной продукции.','ул. Колпакова, 3','3',56.045197,51.958718,'8 (800) 707-88-88','https://zvenigovo.ru/',JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/15270672/2a00000195b9e6c3580ea1f5d80037b5d9de/L'),@empty_schedule,TRUE,'Яндекс Карты','https://yandex.com/maps/org/239804830637/','2026-08-25'),
  ('00000000-0000-4000-8000-102880216901','Авокадо',JSON_ARRAY('магазин Авокадо'),'shopping','Продуктовый магазин.','ул. Колпакова, 51','51',56.048016,51.965979,'+7 (906) 819-95-13',NULL,JSON_ARRAY(),JSON_ARRAY(),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','09:30','closesAt','19:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','09:30','closesAt','19:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','09:30','closesAt','19:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','09:30','closesAt','19:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','09:30','closesAt','19:00')),'sat',JSON_ARRAY(JSON_OBJECT('opensAt','09:30','closesAt','16:00')),'sun',JSON_ARRAY(JSON_OBJECT('opensAt','09:30','closesAt','16:00'))),TRUE,'Яндекс Карты','https://yandex.com/maps/org/102880216901/','2026-08-25'),
  ('00000000-0000-4000-8000-037499143325','Авокадо',JSON_ARRAY('магазин Авокадо'),'shopping','Продуктовый магазин.','ул. Советская, 66','66',56.047384,51.968802,'+7 (912) 016-77-88',NULL,JSON_ARRAY(),JSON_ARRAY(),@daily_08_20,TRUE,'Яндекс Карты','https://yandex.com/maps/org/37499143325/','2026-08-25'),
  ('00000000-0000-4000-8000-145668271034','Восточный',JSON_ARRAY('Глазовская птица','мясной магазин','птица'),'shopping','Магазин мясной продукции и птицы.','ул. Ачинцева, 10','10',56.047185,51.959139,'+7 (3412) 93-02-01','https://glazovptica.ru/',JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/7979184/2a000001849a1d9c59721d27e51c0f652a0a/L'),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','19:00')),'sat',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','18:00')),'sun',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','18:00'))),TRUE,'Яндекс Карты','https://yandex.com/maps/org/145668271034/','2026-08-25'),
  ('00000000-0000-4000-8000-142002136014','Продукты',JSON_ARRAY('магазин на Азина'),'shopping','Местный продуктовый магазин.','ул. Азина, 34А','34А',56.045867,51.948262,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'Яндекс Карты','https://yandex.com/maps/org/142002136014/','2026-08-25'),
  ('00000000-0000-4000-8000-900000000001','Наш магазин',JSON_ARRAY('продукты'),'shopping','Местный магазин; адрес подтверждён в открытом реестре МЧС.','ул. Колпакова, 4А','4А',56.045798,51.960742,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'МЧС России','https://18.mchs.gov.ru/uploads/resource/2024-12-11/e336c4beffeebc102350152c94d5bf32.pdf','2026-08-25'),
  ('00000000-0000-4000-8000-900000000002','Заречный',JSON_ARRAY('магазин Заречный','продукты'),'shopping','Местный магазин; адрес подтверждён в открытом реестре МЧС.','ул. Чапаева, 32А','32А',56.045798,51.960742,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'МЧС России','https://18.mchs.gov.ru/uploads/resource/2024-12-11/e336c4beffeebc102350152c94d5bf32.pdf','2026-08-25'),
  ('00000000-0000-4000-8000-900000000003','Светлана',JSON_ARRAY('магазин Светлана','продукты'),'shopping','Местный магазин; адрес подтверждён в открытом реестре МЧС.','ул. Колпакова, 31','31',56.045798,51.960742,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'МЧС России','https://18.mchs.gov.ru/uploads/resource/2024-12-11/e336c4beffeebc102350152c94d5bf32.pdf','2026-08-25'),
  ('00000000-0000-4000-8000-900000000004','Маргарита',JSON_ARRAY('магазин Маргарита','продукты'),'shopping','Местный магазин; адрес подтверждён в открытом реестре МЧС.','ул. Колпакова, 27','27',56.045798,51.960742,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'МЧС России','https://18.mchs.gov.ru/uploads/resource/2024-12-11/e336c4beffeebc102350152c94d5bf32.pdf','2026-08-25'),

  ('00000000-0000-4000-8000-232427874539','Ozon',JSON_ARRAY('Озон','пвз Ozon'),'delivery','Пункт выдачи заказов.','ул. Советская, 1','1',56.043871,51.959369,'+7 (495) 232-10-00','https://www.ozon.ru/',JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/18769949/2a0000019bbaac5a54ea7d2bacf81f2649be/L'),@daily_09_21,TRUE,'Яндекс Карты','https://yandex.com/maps/org/232427874539/','2026-08-25'),
  ('00000000-0000-4000-8000-119946184408','Wildberries',JSON_ARRAY('Вайлдберриз','ВБ','пвз'),'delivery','Пункт выдачи заказов.','ул. Советская, 1','1',56.043886,51.959428,NULL,'https://www.wildberries.ru/',JSON_ARRAY(),JSON_ARRAY(),@daily_10_21,TRUE,'Яндекс Карты','https://yandex.com/maps/org/119946184408/','2026-08-25'),
  ('00000000-0000-4000-8000-214415641180','Wildberries',JSON_ARRAY('Вайлдберриз','ВБ','пвз'),'delivery','Пункт выдачи заказов.','ул. Колпакова, 22','22',56.046875,51.964148,NULL,'https://www.wildberries.ru/',JSON_ARRAY(),JSON_ARRAY(),@daily_10_21,TRUE,'Яндекс Карты','https://yandex.com/maps/org/214415641180/','2026-08-25'),
  ('00000000-0000-4000-8000-110589712673','5Post',JSON_ARRAY('5 пост','пять пост','пвз'),'delivery','Пункт выдачи заказов в магазине «Пятёрочка».','ул. Советская, 15А','15А',56.044915,51.962297,NULL,'https://fivepost.ru/',JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'Яндекс Карты','https://yandex.com/maps/org/110589712673/','2026-08-25'),
  ('00000000-0000-4000-8000-241929015128','Магнит Маркет',JSON_ARRAY('Magnit Market','пвз Магнит'),'delivery','Пункт выдачи заказов.','ул. Колпакова, 2','2',56.044639,51.958367,'8 (800) 700-96-16','https://market.magnit.ru/',JSON_ARRAY(),JSON_ARRAY(),@daily_0830_22,TRUE,'Яндекс Карты','https://yandex.com/maps/org/241929015128/','2026-08-25'),
  ('00000000-0000-4000-8000-120223067661','СберЛогистика',JSON_ARRAY('Сбер логистика','постамат','пвз'),'delivery','Постамат и получение отправлений.','ул. Колпакова, 20','20',56.046908,51.964275,'8 (800) 100-72-69','https://sberlogistics.ru/',JSON_ARRAY(),JSON_ARRAY(),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','16:15')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','16:15')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','16:15')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','16:15')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','16:15')),'sat',JSON_ARRAY(),'sun',JSON_ARRAY()),TRUE,'Яндекс Карты','https://yandex.com/maps/org/120223067661/','2026-08-25'),

  ('00000000-0000-4000-8000-102707589766','Столовая',JSON_ARRAY('поесть','обед'),'food','Столовая. Режим работы требует уточнения.','ул. Колпакова, 10','10',56.045229,51.960727,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'Яндекс Карты','https://yandex.com/maps/org/102707589766/','2026-08-25'),
  ('00000000-0000-4000-8000-181964466080','Food coffee',JSON_ARRAY('Фуд кофе','шаурма','кофе','фастфуд'),'food','Кафе быстрого питания и кофе с собой.','центр с. Грахово',NULL,56.045464,51.962074,'+7 (993) 526-90-07',NULL,JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/18101536/2a0000019bdb45d4afd7f6dd5826ef89b5c0/L'),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','21:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','21:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','21:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','21:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','21:00')),'sat',JSON_ARRAY(JSON_OBJECT('opensAt','12:00','closesAt','21:00')),'sun',JSON_ARRAY(JSON_OBJECT('opensAt','12:00','closesAt','21:00'))),TRUE,'Яндекс Карты','https://yandex.com/maps/org/181964466080/','2026-08-25'),
  ('00000000-0000-4000-8000-009932802503','Уютный дворик',JSON_ARRAY('кафе Уютный дворик','доставка еды'),'food','Кафе с доставкой, едой навынос и кофе с собой.','ул. Советская, 55','55',56.047481,51.968373,'+7 (987) 419-24-21',NULL,JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/1426646/2a000001892bdb4a0ce76029d2fc1c20fd05/L'),@daily_11_23,TRUE,'Яндекс Карты и МЧС России','https://yandex.com/maps/org/9932802503/','2026-08-25'),
  ('00000000-0000-4000-8000-021870272900','Караоке-кафе «Максимум»',JSON_ARRAY('Maximum','Максимум','караоке'),'food','Караоке-кафе. Режим работы требует уточнения.','ул. Дорожная, 13','13',56.042350,51.981392,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'Яндекс Карты','https://yandex.com/maps/org/21870272900/','2026-08-25'),
  ('00000000-0000-4000-8000-900000000005','Светлое и Тёмное',JSON_ARRAY('Светлое и Темное','бар'),'food','Бар и магазин напитков. Точное недельное расписание требует уточнения.','ул. Ачинцева, 10','10',56.047185,51.959139,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'Яндекс Карты','https://yandex.com/maps/101323/grakhovo/search/%D0%95%D0%B4%D0%B0/','2026-08-25'),

  ('00000000-0000-4000-8000-001103005882','СберБанк',JSON_ARRAY('Сбер','банк','банкомат'),'finance','Отделение банка; обслуживание с дневным перерывом.','ул. Колпакова, 20','20',56.046868,51.964228,'0321','https://www.sberbank.ru/',JSON_ARRAY(),JSON_ARRAY(),JSON_OBJECT('mon',JSON_ARRAY(),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','13:00'),JSON_OBJECT('opensAt','14:00','closesAt','16:00')),'wed',JSON_ARRAY(),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','13:00'),JSON_OBJECT('opensAt','14:00','closesAt','16:00')),'fri',JSON_ARRAY(),'sat',JSON_ARRAY(),'sun',JSON_ARRAY()),TRUE,'Яндекс Карты','https://yandex.com/maps/org/1103005882/','2026-08-25'),
  ('00000000-0000-4000-8000-001092276104','Почта России № 427730',JSON_ARRAY('почта','почтовое отделение'),'government','Отделение почтовой связи.','ул. Ачинцева, 16','16',56.048211,51.958682,'8 (800) 100-00-00','https://www.pochta.ru/',JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/1003740/2a000001850bc4003a411400f1823f1977b9/L'),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','14:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','14:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','14:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','14:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','14:00')),'sat',JSON_ARRAY(),'sun',JSON_ARRAY()),TRUE,'Яндекс Карты','https://yandex.com/maps/org/1092276104/','2026-08-25'),
  ('00000000-0000-4000-8000-057470600823','МФЦ Граховского района',JSON_ARRAY('МФЦ','мои документы','госуслуги'),'government','Центр государственных и муниципальных услуг.','ул. Ачинцева, 5','5',56.045951,51.959708,'122',NULL,JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/4614377/2a000001788cd7c9b932c7ebd90766eb781d/L'),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','16:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','16:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','17:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','16:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','16:00')),'sat',JSON_ARRAY(),'sun',JSON_ARRAY()),TRUE,'Яндекс Карты','https://yandex.com/maps/org/57470600823/','2026-08-25'),
  ('00000000-0000-4000-8000-132685786173','Администрация Граховского района',JSON_ARRAY('администрация','районная администрация'),'government','Администрация муниципального округа.','ул. Ачинцева, 3','3',56.046218,51.959287,'+7 (34163) 3-17-53',NULL,JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/239474/2a0000015eb45ed2502d5820ac4472c598dc/L'),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','17:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','17:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','17:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','17:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','17:00')),'sat',JSON_ARRAY(),'sun',JSON_ARRAY()),TRUE,'Яндекс Карты','https://yandex.com/maps/org/132685786173/','2026-08-25'),
  ('00000000-0000-4000-8000-152756249075','Управление сельского хозяйства',JSON_ARRAY('сельхоз управление','сельское хозяйство'),'government','Управление сельского хозяйства Граховского района.','ул. Ачинцева, 3','3',56.046424,51.959005,'+7 (34163) 3-17-76',NULL,JSON_ARRAY(),JSON_ARRAY(),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','17:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','17:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','17:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','17:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','17:00')),'sat',JSON_ARRAY(),'sun',JSON_ARRAY()),TRUE,'Яндекс Карты','https://yandex.com/maps/org/152756249075/','2026-08-25'),
  ('00000000-0000-4000-8000-001402125529','Участковый пункт полиции',JSON_ARRAY('полиция','участковый'),'government','Приём участкового по отдельным дням недели.','ул. Ачинцева, 7','7',56.046691,51.958687,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','18:00','closesAt','20:00')),'tue',JSON_ARRAY(),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','10:00','closesAt','12:00')),'thu',JSON_ARRAY(),'fri',JSON_ARRAY(),'sat',JSON_ARRAY(JSON_OBJECT('opensAt','09:00','closesAt','11:00')),'sun',JSON_ARRAY()),TRUE,'Яндекс Карты','https://yandex.com/maps/org/1402125529/','2026-08-25'),
  ('00000000-0000-4000-8000-062655726158','МыВместе',JSON_ARRAY('общественная организация'),'services','Общественная организация.','ул. Колпакова, 63','63',56.049752,51.968761,'+7 (34163) 3-16-78',NULL,JSON_ARRAY(),JSON_ARRAY(),@all_day,TRUE,'Яндекс Карты','https://yandex.com/maps/org/62655726158/','2026-08-25'),

  ('00000000-0000-4000-8000-245490330617','Центральная районная больница',JSON_ARRAY('ЦРБ','больница','поликлиника'),'health','Граховская центральная районная больница.','ул. Ачинцева, 20','20',56.050203,51.956877,'+7 (34163) 3-12-64',NULL,JSON_ARRAY(),JSON_ARRAY(),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','17:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','17:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','17:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','17:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','17:00')),'sat',JSON_ARRAY(),'sun',JSON_ARRAY()),TRUE,'Яндекс Карты','https://yandex.com/maps/org/245490330617/','2026-08-25'),
  ('00000000-0000-4000-8000-157449893634','Дом культуры «Лидер»',JSON_ARRAY('ДК','дом культуры','Лидер'),'culture','Граховский районный дом культуры.','ул. Колпакова, 11','11',56.046692,51.960896,'+7 (34163) 3-20-43',NULL,JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/13192844/2a000001902f5074f1861617408fe3848bfd/L'),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','17:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','17:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','17:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','17:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','17:00')),'sat',JSON_ARRAY(JSON_OBJECT('opensAt','12:00','closesAt','22:00')),'sun',JSON_ARRAY(JSON_OBJECT('opensAt','12:00','closesAt','22:00'))),TRUE,'Яндекс Карты','https://yandex.com/maps/org/157449893634/','2026-08-25'),
  ('00000000-0000-4000-8000-001244604983','Краеведческий музей им. Ашальчи Оки',JSON_ARRAY('музей','краеведческий музей'),'culture','Граховский краеведческий музей имени Ашальчи Оки.','ул. Колпакова, 11','11',56.046700,51.961249,'+7 (34163) 3-18-41',NULL,JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/7725442/2a000001892442eabcac8bb0ca8cd1d66090/L'),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','17:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','16:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','16:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','16:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','12:00'),JSON_OBJECT('opensAt','13:00','closesAt','16:00')),'sat',JSON_ARRAY(),'sun',JSON_ARRAY()),TRUE,'Яндекс Карты','https://yandex.com/maps/org/1244604983/','2026-08-25'),
  ('00000000-0000-4000-8000-001403299492','Храм в Грахово',JSON_ARRAY('церковь','православный храм'),'culture','Православный храм.','ул. Колпакова, 1Б','1Б',56.045752,51.961811,NULL,NULL,JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/374295/2a0000015b2e80ad1be594e920e878ecd290/L'),@all_day,TRUE,'Яндекс Карты','https://yandex.com/maps/org/1403299492/','2026-08-25'),

  ('00000000-0000-4000-8000-001230082062','Граховская средняя школа им. А. В. Марченко',JSON_ARRAY('школа','Граховская школа'),'education','Средняя общеобразовательная школа.','ул. Колпакова, 63','63',56.049626,51.968450,'+7 (34163) 3-12-76',NULL,JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'Яндекс Карты','https://yandex.com/maps/org/1230082062/','2026-08-25'),
  ('00000000-0000-4000-8000-138764335248','Детский сад № 1',JSON_ARRAY('детсад','садик'),'education','Детский сад и ясли.','ул. Муфтиева, 3','3',56.047437,51.962077,'+7 (34163) 3-17-97',NULL,JSON_ARRAY(),JSON_ARRAY(),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','07:30','closesAt','18:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','07:30','closesAt','18:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','07:30','closesAt','18:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','07:30','closesAt','18:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','07:30','closesAt','18:00')),'sat',JSON_ARRAY(),'sun',JSON_ARRAY()),TRUE,'Яндекс Карты','https://yandex.com/maps/org/138764335248/','2026-08-25'),
  ('00000000-0000-4000-8000-107559733905','Спортивная школа «Юность»',JSON_ARRAY('Юность','спортшкола','спортивная школа'),'sport','Детско-юношеская спортивная школа.','ул. Колпакова, 63','63',56.050259,51.970583,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),JSON_OBJECT('mon',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','20:00')),'tue',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','20:00')),'wed',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','20:00')),'thu',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','20:00')),'fri',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','20:00')),'sat',JSON_ARRAY(JSON_OBJECT('opensAt','08:00','closesAt','20:00')),'sun',JSON_ARRAY()),TRUE,'Яндекс Карты','https://yandex.com/maps/org/107559733905/','2026-08-25'),

  ('00000000-0000-4000-8000-001108833562','Лукойл',JSON_ARRAY('Lukoil','АЗС','заправка'),'auto','Автозаправочная станция.','ул. Азина, 35','35',56.045143,51.944396,'8 (800) 100-09-11','https://auto.lukoil.ru/',JSON_ARRAY(),JSON_ARRAY('https://avatars.mds.yandex.net/get-altay/9709178/2a000001899fe8a8cc5c682a264d3544d5b2/L'),@daily_07_19,TRUE,'Яндекс Карты','https://yandex.com/maps/org/1108833562/','2026-08-25'),
  ('00000000-0000-4000-8000-029816815609','Автомойка',JSON_ARRAY('мойка','автосервис'),'auto','Автомойка и автомобильные услуги.','ул. Азина, 36','36',56.046265,51.946405,'+7 (950) 813-71-25',NULL,JSON_ARRAY(),JSON_ARRAY(),@daily_09_18,TRUE,'Яндекс Карты','https://yandex.com/maps/org/29816815609/','2026-08-25'),
  ('00000000-0000-4000-8000-042389847938','Автосервис',JSON_ARRAY('ремонт авто','СТО'),'auto','Ремонт и обслуживание автомобилей. Режим работы требует уточнения.','ул. Азина, 38А','38А',56.046183,51.943438,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'Яндекс Карты','https://yandex.com/maps/org/42389847938/','2026-08-25'),
  ('00000000-0000-4000-8000-079038667580','Автомойка',JSON_ARRAY('мойка','автосервис'),'auto','Автомойка и автомобильные услуги. Режим работы требует уточнения.','ул. Дорожная, 11','11',56.042461,51.980963,NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),@empty_schedule,TRUE,'Яндекс Карты','https://yandex.com/maps/org/79038667580/','2026-08-25')
ON DUPLICATE KEY UPDATE
  name = VALUES(name), aliases_json = VALUES(aliases_json), category = VALUES(category),
  description = VALUES(description), address_label = VALUES(address_label),
  house_number = VALUES(house_number), latitude = VALUES(latitude), longitude = VALUES(longitude),
  phone = VALUES(phone), website = VALUES(website), social_links_json = VALUES(social_links_json),
  photo_urls_json = VALUES(photo_urls_json), schedule_json = VALUES(schedule_json),
  active = VALUES(active), source_name = VALUES(source_name), source_url = VALUES(source_url),
  source_checked_at = VALUES(source_checked_at);
