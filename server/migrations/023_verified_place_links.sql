UPDATE places
SET social_links_json = JSON_ARRAY(
  JSON_OBJECT('label', 'MAX', 'url', 'https://max.ru/id1839012168_gos')
)
WHERE id = '00000000-0000-4000-8000-132685786173';

UPDATE places
SET social_links_json = JSON_ARRAY(
  JSON_OBJECT('label', 'MAX', 'url', 'https://max.ru/id1806005246_gos')
)
WHERE id = '00000000-0000-4000-8000-001230082062';

UPDATE places
SET website = 'https://rdk-lider.udm.muzkult.ru/',
    source_name = 'Культура.РФ и Яндекс Карты',
    source_url = 'https://www.culture.ru/institutes/62152/grakhovskii-raionnyi-dom-kultury-lider'
WHERE id = '00000000-0000-4000-8000-157449893634';
