import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingDraft, BookingMessage } from '../server/messenger-booking';
const mocks=vi.hoisted(()=>({firstRow:vi.fn(),execute:vi.fn(),query:vi.fn(),user:vi.fn(),send:vi.fn(),resolve:vi.fn(),options:vi.fn(),inject:vi.fn(),signQuote:vi.fn(),link:vi.fn(),phone:vi.fn()}));
vi.mock('../server/db',()=>({db:{execute:mocks.execute},firstRow:mocks.firstRow,withTransaction:(fn:(c:unknown)=>unknown)=>fn({query:mocks.query,execute:mocks.execute})}));
vi.mock('../server/repositories',()=>({findUserWithRoles:mocks.user,findOrCreatePhoneUser:mocks.phone,linkMessengerIdentity:mocks.link}));
vi.mock('../server/security', async original => ({
  ...await original<typeof import('../server/security')>(),
  signSession: async () => 'test-session', signOrderQuote: mocks.signQuote,
}));
vi.mock('../server/bot-address-ai', () => ({ interpretBotAddress: vi.fn().mockResolvedValue(null) }));
vi.mock('../server/bot-address',async original=>({...await original<typeof import('../server/bot-address')>(),resolveBotAddress:mocks.resolve,resolveBotAddressOptions:mocks.options}));
vi.mock('../server/address-directory',()=>({getAddressDirectory:vi.fn()}));
vi.mock('../server/geocoding',()=>({searchAddresses:vi.fn()}));
vi.mock('../server/places',()=>({listPlaces:vi.fn(),placeToAddress:vi.fn()}));
vi.mock('../server/telegram-bot',()=>({sendTelegramMessage:mocks.send}));
vi.mock('../server/max-bot',()=>({sendMaxMessage:mocks.send}));
vi.mock('../server/vk-bot',()=>({sendVkMessage:mocks.send,vkInlineKeyboard:(rows:unknown)=>rows}));
vi.mock('../server/messenger-notifications',()=>({appUrl:(path:string)=>`https://taxigr.ru${path}`}));
import { createMessengerBookingHandler } from '../server/messenger-booking';
import { interpretBotAddress } from '../server/bot-address-ai';
import type { FastifyInstance } from 'fastify';
import { grahovoAddressCatalog } from '../src/data/grahovo-address-catalog';

const initial=():BookingDraft=>({id:'test-draft',flowVersion:2,stage:'idle'});
const orderId='123e4567-e89b-12d3-a456-426614174000';
let draft:BookingDraft;
let active:{id:string;status:string}|null;
let expiresAt:Date;
const events=new Map<string,unknown>();
const message=(text:string,eventId=text):BookingMessage=>({provider:'telegram',externalUserId:'42',chatId:'42',eventId,text});
const handle=createMessengerBookingHandler({inject:mocks.inject} as unknown as FastifyInstance);
const replyText=()=> (mocks.send.mock.calls.at(-1)?.[1]?.text ?? mocks.send.mock.calls.at(-1)?.[1]?.message) as string;
const replyButtons=()=>mocks.send.mock.calls.at(-1)?.[1]?.reply_markup?.inline_keyboard?.flat() ?? [];
const start=()=>handle(message('b:start'));

beforeEach(()=>{
  vi.resetAllMocks(); events.clear(); draft=initial(); active=null; expiresAt=new Date(Date.now()+1800000);
  vi.mocked(interpretBotAddress).mockResolvedValue(null);
  mocks.firstRow.mockImplementation(async(sql:string)=>sql.includes('user_messenger_accounts')?{user_id:'user',chat_id:'42'}:
    sql.includes('SELECT id, status FROM orders')?active:null);
  mocks.user.mockResolvedValue({id:'user',roles:['passenger'],phone:'+79000000000'});
  mocks.resolve.mockResolvedValue(null); mocks.signQuote.mockResolvedValue('signed-manual-quote');
  mocks.options.mockImplementation(async(raw, pickup, selected) => ({ address: selected ?? await mocks.resolve(raw, pickup), candidates: [] }));
  mocks.query.mockImplementation(async(sql:string,params:unknown[])=>sql.includes('SELECT draft_json')?
    [[{draft_json:JSON.stringify(draft),expires_at:expiresAt}]]:
    [[...(events.has(String(params[2]))?[{response_json:events.get(String(params[2]))}]:[])]]);
  mocks.execute.mockImplementation(async(sql:string,params:unknown[])=>{
    if(sql.startsWith('UPDATE messenger_booking_drafts'))draft=JSON.parse(String(params[0]));
    if(sql.startsWith('INSERT INTO messenger_booking_events'))events.set(String(params[2]),JSON.parse(String(params[3])));
    return [{affectedRows:1}];
  });
  mocks.inject.mockImplementation(async()=>{
    active={id:orderId,status:'searching'};
    return {statusCode:201,json:()=>({data:active})};
  });
});

describe('taxi booking in messenger conversations',()=>{
  it('starts from a yes and remembers the destination when it is given first', async () => {
    await handle(message('Да'));
    expect(replyText()).toBe('Откуда вас забрать?');
    await handle(message('Да, в Можгу'));
    expect(draft.destinationRaw).toBe('Можгу');
    expect(replyText()).toBe('Откуда вас забрать?');
    await handle(message('У старой бани'));
    expect(replyText()).toContain('У старой бани → Можгу');
    expect(draft.stage).toBe('confirm');
    expect(mocks.inject).not.toHaveBeenCalled();
  });
  it.each(['vk', 'max', 'telegram'] as const)('offers phone verification inside %s', async provider => {
    mocks.firstRow.mockResolvedValue(null);
    await handle({ ...message('b:start'), provider });
    const reply = mocks.send.mock.calls.at(-1)?.[1];
    expect(JSON.stringify(reply)).not.toContain('taxigr.ru/sign-in');
    if (provider === 'vk') expect(reply.keyboard[0][0]).toMatchObject({ label: 'Подтвердить номер', url: expect.stringMatching(/^https:\/\/vk\.com\/app/u) });
    else if (provider === 'max') expect(reply.attachments[0].payload.buttons[0][0]).toMatchObject({ type: 'request_contact' });
    else expect(reply.reply_markup.keyboard[0][0]).toMatchObject({ request_contact: true });
    expect(mocks.inject).not.toHaveBeenCalled();
  });
  it.each(['vk', 'max', 'telegram'] as const)('runs a natural ride request through AI before resolving both endpoints in %s', async provider => {
    const text = 'с кизнера нужно забрать и увезти в Мари возжай';
    vi.mocked(interpretBotAddress).mockResolvedValue({ pickup: 'Кизнер', destination: 'Мари-Возжай' });
    await handle({ ...message(text), provider });
    expect(interpretBotAddress).toHaveBeenCalledWith(text, 'pickup');
    expect(mocks.resolve).toHaveBeenCalledWith('Кизнер', true);
    expect(mocks.resolve).toHaveBeenCalledWith('Мари-Возжай', false);
    expect(draft.stage).toBe('confirm');
    expect(mocks.inject).not.toHaveBeenCalled();
  });
  it.each(['max', 'telegram', 'vk'] as const)('preserves apartment and entrance details after %s addresses resolve to mapped houses', async provider => {
    const pickupRaw='Грахово, ул 50 лет победы дом 10 кв 2';
    const destinationRaw='Ул Ачинцева 11 подъезд 3 15 квартира';
    const pickup=grahovoAddressCatalog.find(a=>a.label==='с. Грахово, ул. 50 лет Победы, 10')!;
    const destination=grahovoAddressCatalog.find(a=>a.label==='с. Грахово, ул. Ачинцева, 11')!;
    mocks.resolve.mockImplementation(async (_raw, isPickup)=>isPickup?pickup:destination);
    mocks.inject.mockImplementation(async ({url}: {url:string})=>({statusCode:200,json:()=>({data:url==='/v1/quotes'
      ? {quoteToken:'fixed-quote',tariffs:[{code:'economy',priceMinor:25000}]} : {id:orderId,status:'searching'}})}));
    for(const text of ['b:start',pickupRaw,destinationRaw])await handle({...message(text),provider});
    expect(replyText()).toContain('Стоимость: 250 ₽');
    await handle({...message(`b:confirm:${draft.id}`),provider});
    expect(mocks.inject).toHaveBeenCalledWith(expect.objectContaining({url:'/v1/orders',payload:expect.objectContaining({
      pickup,destination,quoteToken:'fixed-quote',comment:`Из ${provider}. Со слов пассажира: ${pickupRaw} → ${destinationRaw}`,
    })}));
  });
  it.each(['max', 'telegram', 'vk'] as const)('keeps call and write controls when reopening an assigned order in %s', async provider => {
    active={id:orderId,status:'accepted'};
    await handle({...message('/start'),provider});
    const body=JSON.stringify(mocks.send.mock.calls.at(-1)?.[1]);
    expect(body).toContain(`r:contact:${orderId}`);
    expect(body).toContain(`https://taxigr.ru/chat/${orderId}`);
    expect(body).toContain('Позвонить водителю');
    expect(body).toContain('Написать водителю');
    expect(mocks.inject).not.toHaveBeenCalled();
  });
  it.each(['telegram', 'vk', 'max'] as const)('lets a driver with an older app set the negotiated fare through %s', async provider => {
    mocks.user.mockResolvedValue({id:'user',roles:['passenger','driver'],phone:'+79000000000'});
    mocks.firstRow.mockImplementation(async(sql:string) => sql.includes('user_messenger_accounts')
      ? {user_id:'user',chat_id:'42'} : sql.includes('SELECT o.id FROM orders') ? {id:orderId} : null);
    mocks.inject.mockResolvedValue({statusCode:200,json:()=>({data:{id:orderId,priceMinor:35050,manualPriceSet:true}})});
    await handle({...message('Цена 350,50'),provider});
    expect(mocks.inject).toHaveBeenCalledWith(expect.objectContaining({
      url:`/v1/driver/orders/${orderId}/fare`,payload:{priceMinor:35050},
    }));
    expect(mocks.send.mock.calls.at(-1)?.[1]?.text ?? mocks.send.mock.calls.at(-1)?.[1]?.message)
      .toContain('Стоимость сохранена');
    expect(mocks.options).not.toHaveBeenCalled();
    expect(draft.stage).toBe('idle');
  });
  it('does not submit a fare when a driver has no assigned unpriced order', async () => {
    mocks.user.mockResolvedValue({id:'user',roles:['passenger','driver'],phone:'+79000000000'});
    await handle(message('Цена 350'));
    expect(mocks.inject).not.toHaveBeenCalled();
    expect(replyText()).toContain('нет текущего заказа');
  });
  it.each(['telegram', 'vk', 'max'] as const)('offers and accepts ambiguous addresses in %s without ordering automatically', async provider => {
    const candidates = ['с. Грахово, ул. Советская, 10', 'д. Каменное, ул. Советская, 10'].map((label, i) => ({
      id: String(i), label, houseNumber: '10', coordinates: { latitude: 56.05 + i * 0.1, longitude: 51.96 },
    }));
    const send = (text: string, eventId = text) => handle({ ...message(text, eventId), provider });
    mocks.options.mockImplementation(async(raw, pickup, selected) => selected ? {address:selected,candidates:[]} :
      pickup ? {address:null,candidates} : {address:{...candidates[0],id:'dest'},candidates:[]});
    mocks.inject.mockResolvedValue({statusCode:200,json:()=>({data:{quoteToken:'fixed',tariffs:[{code:'economy',priceMinor:20000}]}})});
    await send('b:start'); await send('советкая10 → больница');
    expect(draft.stage).toBe('choose'); expect(mocks.inject).not.toHaveBeenCalled();
    const reply = JSON.stringify(mocks.send.mock.calls.at(-1)?.[1]);
    expect(reply).toContain('Каменное'); expect(reply).toContain(`b:pick:${draft.id}:1`);
    await send('b:pick:stale:1', 'stale'); expect(draft.stage).toBe('choose');
    await send(`b:pick:${draft.id}:99`, 'invalid'); expect(draft.stage).toBe('choose');
    await send(`b:pick:${draft.id}:1`, 'selected');
    expect(draft.stage).toBe('confirm'); expect(draft.pickup?.label).toContain('Каменное');
    expect(mocks.inject).toHaveBeenCalledTimes(1);
    expect(mocks.inject.mock.calls[0]?.[0].url).toBe('/v1/quotes');
    await send(`b:pick:${draft.id}:1`, 'replayed'); expect(mocks.inject).toHaveBeenCalledTimes(1);
  });
  it('accepts a more specific address instead of requiring a choice button', async () => {
    const candidates = ['Грахово', 'Каменное'].map((v, i) => ({id:String(i),label:`${v} Советская 10`,houseNumber:'10',coordinates:{latitude:56+i*0.1,longitude:52}}));
    mocks.options.mockImplementation(async(raw, pickup, selected) => selected ? {address:selected,candidates:[]} :
      pickup && !raw.includes('Грахово') ? {address:null,candidates} : {address:candidates[0],candidates:[]});
    mocks.inject.mockResolvedValue({statusCode:200,json:()=>({data:{quoteToken:'fixed',tariffs:[{code:'economy',priceMinor:20000}]}})});
    await start(); await handle(message('советская10 → больница')); expect(draft.stage).toBe('choose');
    await handle(message('Грахово Советская 10')); expect(draft.stage).toBe('confirm');
    expect(draft.pickupRaw).toBe('Грахово Советская 10');
  });
  it('asks pickup and destination, then offers an honest unpriced order',async()=>{
    await handle(message('/start')); expect(replyButtons()).toContainEqual({text:'Заказать сообщениями',callback_data:'b:start'});
    await start(); expect(replyText()).toContain('Откуда вас забрать?');
    await handle(message('у старого клуба')); expect(replyText()).toContain('Куда');
    await handle(message('до зелёного дома'));
    expect(replyText()).toContain('Стоимость определит водитель');
    expect(replyText()).not.toContain('0 ₽');
    expect(mocks.inject).not.toHaveBeenCalled();
    const confirm=`b:confirm:${draft.id}`;
    await handle(message(confirm,'confirm-1'));
    expect(mocks.inject).toHaveBeenCalledWith(expect.objectContaining({url:'/v1/orders',payload:expect.objectContaining({
      quoteToken:'signed-manual-quote',pickup:expect.objectContaining({label:'у старого клуба'}),
      legalAcceptance:expect.objectContaining({termsAccepted:true}),
    })}));
    expect(replyText()).toContain('Такси вызвано');
    expect(replyButtons()).toContainEqual({text:'Отменить заказ',callback_data:`r:cancel:${orderId}`});
  });
  it.each(['ММ','привет','у клуба → у дома'])('does not treat the initial %s as an address',async text=>{
    await handle(message(text));
    expect(draft.stage).toBe('idle');expect(draft.pickupRaw).toBeUndefined();
    expect(replyButtons()).toContainEqual({text:'Заказать сообщениями',callback_data:'b:start'});
    expect(mocks.resolve).not.toHaveBeenCalled();expect(mocks.inject).not.toHaveBeenCalled();
  });
  it('resets legacy implicit drafts instead of reusing a random pickup',async()=>{
    draft={id:'old',stage:'destination',pickupRaw:'ММ'};
    await handle(message('привет'));
    expect(draft.stage).toBe('idle');expect(draft.pickupRaw).toBeUndefined();
  });
  it('returns to the menu after a draft expires',async()=>{
    draft={...initial(),stage:'destination',pickupRaw:'клуб'};expiresAt=new Date(Date.now()-1);
    await handle(message('дом'));
    expect(draft.stage).toBe('idle');expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('replays duplicate deliveries without advancing the conversation or creating a second order',async()=>{
    await start();
    await handle(message('у клуба','m1'));await handle(message('у клуба','m1'));
    expect(draft.stage).toBe('destination');
    await handle(message('больница','m2'));
    const confirm=`b:confirm:${draft.id}`;
    await handle(message(confirm,'c1'));await handle(message(confirm,'c1'));await handle(message(confirm,'c2'));
    expect(mocks.inject).toHaveBeenCalledTimes(1);
  });
  it('shows the actual tariff and requires confirmation',async()=>{
    await start();
    mocks.resolve.mockImplementation(async(raw:string)=>({id:raw,label:raw,houseNumber:'10',coordinates:{latitude:56,longitude:52}}));
    mocks.inject.mockResolvedValueOnce({statusCode:200,json:()=>({data:{quoteToken:'signed-fixed',tariffs:[{code:'economy',priceMinor:25000}]}})});
    await handle(message('Советская 10 → Ачинцева 5'));
    expect(replyText()).toContain('250 ₽');expect(draft.quoteToken).toBe('signed-fixed');
    expect(mocks.inject).toHaveBeenCalledTimes(1);expect(mocks.signQuote).not.toHaveBeenCalled();
  });
  it.each(['telegram', 'vk', 'max'] as const)('shows the discounted rounded fare in %s', async provider => {
    mocks.resolve.mockImplementation(async (raw: string) => ({id:raw,label:raw,houseNumber:'10',coordinates:{latitude:56,longitude:52}}));
    mocks.inject.mockResolvedValueOnce({statusCode:200,json:()=>({data:{quoteToken:'discount-30',tariffs:[{
      code:'economy',priceMinor:14000,originalPriceMinor:20000,discountPercent:30,
    }]}})});
    await handle({...message('b:start'),provider});
    await handle({...message('Советская 10 → Ачинцева 5'),provider});
    const reply = mocks.send.mock.calls.at(-1)![1];
    expect(reply.text ?? reply.message).toContain('Скидка 30%');
    expect(reply.text ?? reply.message).toContain('200 ₽ → 140 ₽');
    expect(reply.text ?? reply.message).toContain('округлена до ближайших 10 ₽');
    expect(JSON.stringify(reply)).toContain('Вызвать за 140 ₽');
    expect(draft.discountPercent).toBe(30);
    expect(draft.fareRoundingMinor).toBe(1000);
    expect(draft.fareRoundingMode).toBe('nearest');
    await handle({...message(`b:confirm:${draft.id}`),provider});
    expect(mocks.inject.mock.calls.at(-1)![0].url).toBe('/v1/orders');
  });
  it.each([5000,1000])('refreshes a discounted draft that still rounds up with step %i', async step => {
    draft = {...initial(),stage:'confirm',pickupRaw:'Советская 10',destinationRaw:'Ачинцева 5',
      priceMinor:20000,originalPriceMinor:20000,discountPercent:30,fareRoundingMinor:step,
      quoteToken:'old-rounding',quotedAt:Date.now()};
    mocks.resolve.mockImplementation(async (raw: string) => ({id:raw,label:raw,houseNumber:'10',coordinates:{latitude:56,longitude:52}}));
    mocks.inject.mockResolvedValueOnce({statusCode:200,json:()=>({data:{quoteToken:'ten-ruble-rounding',fareRoundingMinor:1000,tariffs:[{
      code:'economy',priceMinor:14000,originalPriceMinor:20000,discountPercent:30,
    }]}})});
    await handle(message(`b:confirm:${draft.id}`));
    expect(replyText()).toContain('Условия расчёта изменились');
    expect(replyText()).toContain('200 ₽ → 140 ₽');
    expect(draft.fareRoundingMinor).toBe(1000);
    expect(mocks.inject).toHaveBeenCalledTimes(1);
    expect(mocks.inject.mock.calls[0]![0].url).toBe('/v1/quotes');
  });
  it.each([[50, 11000], [20, 18000]])('refreshes a pending %i percent draft and asks to confirm the new fare', async (discountPercent, priceMinor) => {
    draft = {...initial(),stage:'confirm',pickupRaw:'Советская 10',destinationRaw:'Ачинцева 5',
      priceMinor,originalPriceMinor:22000,discountPercent,fareRoundingMinor:1000,fareRoundingMode:'nearest',
      quoteToken:'old-discount',quotedAt:Date.now()};
    mocks.resolve.mockImplementation(async (raw: string) => ({id:raw,label:raw,houseNumber:'10',coordinates:{latitude:56,longitude:52}}));
    mocks.inject.mockResolvedValueOnce({statusCode:409,json:()=>({error:{code:'PROMOTION_QUOTE_CHANGED',message:'Условия скидки изменились'}})});
    mocks.inject.mockResolvedValueOnce({statusCode:200,json:()=>({data:{quoteToken:'discount-30',tariffs:[{
      code:'economy',priceMinor:15000,originalPriceMinor:22000,discountPercent:30,
    }]}})});
    await handle(message(`b:confirm:${draft.id}`));
    expect(replyText()).toContain('Расчёт обновлён');
    expect(replyText()).toContain('Скидка 30%');
    expect(draft.priceMinor).toBe(15000);
    expect(mocks.inject).toHaveBeenCalledTimes(2);
    expect(mocks.inject.mock.calls[0]![0].url).toBe('/v1/orders');
    expect(mocks.inject.mock.calls[1]![0].url).toBe('/v1/quotes');
    expect(draft.stage).toBe('confirm');
  });
  it('refreshes an expired quote and rejects the older card after refresh',async()=>{
    await start();
    await handle(message('у клуба → у дома'));
    draft.quotedAt=Date.now()-31*60_000;
    const stale=`b:confirm:${draft.id}`;
    await handle(message(stale,'c1'));
    expect(replyText()).toContain('Расчёт обновлён');expect(mocks.inject).not.toHaveBeenCalled();
    await handle(message(stale,'c2'));expect(replyText()).toContain('устарела');expect(mocks.inject).not.toHaveBeenCalled();
  });
  it('can confirm a quote after 20 minutes without losing the draft', async () => {
    await start();
    await handle(message('у клуба → у дома'));
    draft.quotedAt = Date.now() - 20 * 60_000;
    await handle(message(`b:confirm:${draft.id}`));
    expect(mocks.inject.mock.calls[0]?.[0].url).toBe('/v1/orders');
    expect(replyText()).toContain('Такси вызвано');
  });
  it('refreshes an old five-minute token rejected by the API and waits for confirmation', async () => {
    await start();
    await handle(message('у клуба → у дома'));
    draft.quotedAt = Date.now() - 6 * 60_000;
    const old = draft.id;
    mocks.inject.mockResolvedValueOnce({ statusCode: 409, json: () => ({ error: { code: 'QUOTE_EXPIRED_OR_INVALID' } }) });
    await handle(message(`b:confirm:${old}`));
    expect(replyText()).toContain('Расчёт обновлён');
    expect(draft.id).not.toBe(old);
    expect(draft.stage).toBe('confirm');
    expect(mocks.inject).toHaveBeenCalledTimes(1);
    await handle(message(`b:confirm:${draft.id}`));
    expect(replyText()).toContain('Такси вызвано');
  });
  it.each(['max', 'vk', 'telegram'] as const)('extracts an explicit price question in %s without booking automatically', async provider => {
    await handle({ ...message('Здравствуйте, во сколько обойдётся поездка с санатория в Кизнере до деревни Мишкино?'), provider });
    expect(draft.pickupRaw).toBe('санатория в Кизнере');
    expect(draft.destinationRaw).toBe('деревни Мишкино?');
    expect(replyText()).toContain('Проверьте заказ');
    expect(mocks.inject).not.toHaveBeenCalled();
  });
  it('retains the source of a two-message price inquiry', async () => {
    await start();
    await handle(message('Здравствуйте, мне бы хотелось узнать про цену , во сколько обойдётся поездка с санатория в Кизнере'));
    expect(draft.pickupRaw).toBe('санатория в Кизнере');
    await handle(message('деревни Мишкино Граховского р-на.'));
    expect(draft.destinationRaw).toContain('Мишкино');
    expect(draft.stage).toBe('confirm');
  });
  it('asks for a destination after a time-only note and makes immediate dispatch explicit', async () => {
    await start();
    await handle(message('Лебедевская 3'));
    await handle(message('через 30 минут'));
    expect(draft.stage).toBe('destination');
    expect(draft.pickupTiming).toBe('через 30 минут');
    await handle(message('Заречная 4'));
    expect(replyText()).toContain('начнёт поиск водителя сейчас');
    expect(replyButtons()).toContainEqual({ text: 'Вызвать сейчас без цены', callback_data: `b:confirm:${draft.id}` });
    expect(mocks.inject).not.toHaveBeenCalled();
  });
  it('resumes the current step when a passenger presses a replaced button', async () => {
    await start();
    const old = draft.id;
    await handle(message('Лебедевская 3'));
    await handle(message(`b:cancel:${old}`));
    expect(replyText()).toContain('устарела');
    expect(replyText()).toContain('Куда поедем');
    expect(draft.pickupRaw).toBe('Лебедевская 3');
    expect(replyButtons()).toContainEqual({ text: 'Отменить оформление', callback_data: `b:cancel:${draft.id}` });
  });
  it('keeps the draft on failed order creation and retries with the same idempotency key',async()=>{
    await start();
    await handle(message('у клуба → у дома'));const confirm=`b:confirm:${draft.id}`;
    mocks.inject.mockResolvedValueOnce({statusCode:503,json:()=>({error:{message:'Попробуйте позже'}})});
    await handle(message(confirm,'c1'));expect(draft.stage).toBe('confirm');
    await handle(message(confirm,'c2'));
    expect(mocks.inject.mock.calls[0]![0].payload.idempotencyKey).toBe(mocks.inject.mock.calls[1]![0].payload.idempotencyKey);
    expect(draft.stage).toBe('done');
  });
  it('does not bypass a service restriction through manual pricing',async()=>{
    await start();
    mocks.resolve.mockResolvedValue({id:'precise',label:'Советская 10',coordinates:{latitude:56,longitude:52}});
    mocks.inject.mockResolvedValue({statusCode:403,json:()=>({error:{code:'BOOKING_DISABLED',message:'Заказы отключены'}})});
    await handle(message('Советская 10 → Ачинцева 5'));
    expect(replyText()).toBe('Заказы отключены');expect(mocks.signQuote).not.toHaveBeenCalled();
  });
  it('does not authenticate a typed phone number',async()=>{
    mocks.firstRow.mockResolvedValue(null);await handle(message('+79990000000'));
    expect(mocks.phone).not.toHaveBeenCalled();expect(replyButtons()).toContainEqual({text:'Заказать сообщениями',callback_data:'b:start'});
    await start();expect(mocks.send.mock.calls.at(-1)![1].reply_markup.keyboard[0][0].request_contact).toBe(true);
  });
  it('requests an own contact when an existing messenger account has no phone',async()=>{
    mocks.user.mockResolvedValue({id:'user',roles:['passenger']});
    await start();
    expect(mocks.send.mock.calls.at(-1)![1].reply_markup.keyboard[0][0].request_contact).toBe(true);
    expect(mocks.inject).not.toHaveBeenCalled();
  });
  it('does not move a verified contact from another passenger account',async()=>{
    mocks.firstRow.mockImplementation(async(sql:string)=>sql.includes('user_messenger_accounts')?
      {user_id:'user',chat_id:'42'}:sql.includes('SELECT id FROM users')?{id:'someone-else'}:null);
    await handle({...message('такси'),verifiedPhone:'+79000000000'});
    expect(replyText()).toContain('другим профилем');expect(mocks.inject).not.toHaveBeenCalled();
  });
  it('rejects a different chat and a blocked account',async()=>{
    await handle({...message('такси'),chatId:'999'});expect(mocks.send).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({id:'user',blockedAt:'now',roles:['passenger']});await handle(message('такси'));
    expect(replyText()).toContain('недоступен');expect(mocks.inject).not.toHaveBeenCalled();
  });
  it.each(['vk','max'] as const)('uses the same route flow in %s',async provider=>{
    await handle({...message('ММ'),provider});expect(draft.stage).toBe('idle');
    const menu=mocks.send.mock.calls.at(-1)![1];
    expect(JSON.stringify(menu)).toContain('b:start');
    await handle({...message('b:start'),provider});expect(draft.stage).toBe('pickup');
    await handle({...message('клуб → дом'),provider});expect(draft.stage).toBe('confirm');
    const reply=mocks.send.mock.calls.at(-1)![1];expect(reply.text??reply.message).toContain('Стоимость определит водитель');
  });
  it.each(['Отмена','отменить заказ','/cancel'])('asks to cancel the actual order for %s',async text=>{
    active={id:orderId,status:'searching'};
    await handle(message(text));
    expect(replyText()).toContain('Отменить заказ?');
    expect(replyButtons()).toContainEqual({text:'Да, отменить',callback_data:`r:cancel-ok:${orderId}`});
    expect(mocks.inject).not.toHaveBeenCalled();
    expect(active.status).toBe('searching');
  });
  it('lets the last draft cancellation button cancel the created order with confirmation',async()=>{
    await start();await handle(message('клуб → дом'));const id=draft.id;
    await handle(message(`b:confirm:${id}`));await handle(message(`b:cancel:${id}`));
    expect(replyButtons()).toContainEqual({text:'Да, отменить',callback_data:`r:cancel-ok:${orderId}`});
    expect(draft.orderId).toBe(orderId);expect(mocks.inject).toHaveBeenCalledTimes(1);
  });
  it.each(['ММ','b:start','/start'])('shows active order controls instead of starting over for %s',async text=>{
    active={id:orderId,status:'accepted'};
    await handle(message(text));
    expect(replyButtons()).toContainEqual({text:'Отменить заказ',callback_data:`r:cancel:${orderId}`});
    expect(draft.stage).toBe('idle');expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('does not offer cancellation once the ride has started',async()=>{
    active={id:orderId,status:'in_progress'};await handle(message('Отмена'));
    expect(replyText()).toContain('Поездка уже началась');
    expect(JSON.stringify(replyButtons())).not.toContain('cancel');expect(mocks.inject).not.toHaveBeenCalled();
  });
  it('cancels an unfinished draft and requires a new explicit start',async()=>{
    await start();await handle(message('у клуба'));await handle(message('отмена'));
    expect(replyText()).toContain('Оформление отменено');expect(draft.pickupRaw).toBeUndefined();
    await handle(message('ММ'));expect(draft.stage).toBe('idle');expect(mocks.inject).not.toHaveBeenCalled();
  });
  it('starts a new order after the previous order has been cancelled',async()=>{
    await start();await handle(message('клуб → дом'));await handle(message(`b:confirm:${draft.id}`));
    active=null;
    await handle(message('b:start','start-again'));expect(draft.stage).toBe('pickup');expect(draft.orderId).toBeUndefined();
  });
  it('asks pickup after a verified contact instead of interpreting the contact as an address',async()=>{
    await handle({...message('Контакт'),verifiedPhone:'+79000000000'});
    expect(draft.stage).toBe('pickup');expect(draft.pickupRaw).toBeUndefined();
    expect(replyText()).toContain('Откуда вас забрать?');
  });
});
