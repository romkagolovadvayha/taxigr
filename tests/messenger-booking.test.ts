import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingDraft, BookingMessage } from '../server/messenger-booking';
const mocks=vi.hoisted(()=>({firstRow:vi.fn(),execute:vi.fn(),query:vi.fn(),user:vi.fn(),send:vi.fn(),resolve:vi.fn(),inject:vi.fn(),signQuote:vi.fn(),link:vi.fn(),phone:vi.fn()}));
vi.mock('../server/db',()=>({db:{execute:mocks.execute},firstRow:mocks.firstRow,withTransaction:(fn:(c:unknown)=>unknown)=>fn({query:mocks.query,execute:mocks.execute})}));
vi.mock('../server/repositories',()=>({findUserWithRoles:mocks.user,findOrCreatePhoneUser:mocks.phone,linkMessengerIdentity:mocks.link}));
vi.mock('../server/security',()=>({signSession:async()=> 'test-session',signOrderQuote:mocks.signQuote}));
vi.mock('../server/bot-address',async original=>({...await original<typeof import('../server/bot-address')>(),resolveBotAddress:mocks.resolve}));
vi.mock('../server/address-directory',()=>({getAddressDirectory:vi.fn()}));
vi.mock('../server/geocoding',()=>({searchAddresses:vi.fn()}));
vi.mock('../server/places',()=>({listPlaces:vi.fn(),placeToAddress:vi.fn()}));
vi.mock('../server/telegram-bot',()=>({sendTelegramMessage:mocks.send}));
vi.mock('../server/max-bot',()=>({sendMaxMessage:mocks.send}));
vi.mock('../server/vk-bot',()=>({sendVkMessage:mocks.send,vkInlineKeyboard:(rows:unknown)=>rows}));
import { createMessengerBookingHandler } from '../server/messenger-booking';
import type { FastifyInstance } from 'fastify';

const initial=():BookingDraft=>({id:'test-draft',stage:'pickup'});
let draft:BookingDraft;
const events=new Map<string,unknown>();
const message=(text:string,eventId=text):BookingMessage=>({provider:'telegram',externalUserId:'42',chatId:'42',eventId,text});
const handle=createMessengerBookingHandler({inject:mocks.inject} as unknown as FastifyInstance);
const replyText=()=>mocks.send.mock.calls.at(-1)?.[1]?.text as string;

beforeEach(()=>{
  vi.resetAllMocks(); events.clear(); draft=initial();
  mocks.firstRow.mockImplementation(async(sql:string)=>sql.includes('user_messenger_accounts')?{user_id:'user',chat_id:'42'}:null);
  mocks.user.mockResolvedValue({id:'user',roles:['passenger'],phone:'+79000000000'});
  mocks.resolve.mockResolvedValue(null); mocks.signQuote.mockResolvedValue('signed-manual-quote');
  mocks.query.mockImplementation(async(sql:string,params:unknown[])=>sql.includes('SELECT draft_json')?
    [[{draft_json:JSON.stringify(draft),expires_at:new Date(Date.now()+1800000)}]]:
    [[...(events.has(String(params[2]))?[{response_json:events.get(String(params[2]))}]:[])]]);
  mocks.execute.mockImplementation(async(sql:string,params:unknown[])=>{
    if(sql.startsWith('UPDATE messenger_booking_drafts'))draft=JSON.parse(String(params[0]));
    if(sql.startsWith('INSERT INTO messenger_booking_events'))events.set(String(params[2]),JSON.parse(String(params[3])));
    return [{affectedRows:1}];
  });
  mocks.inject.mockResolvedValue({statusCode:201,json:()=>({data:{id:'created-order'}})});
});

describe('taxi booking in messenger conversations',()=>{
  it('asks pickup and destination, then offers an honest unpriced order',async()=>{
    await handle(message('/start')); expect(replyText()).toContain('Откуда');
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
  });
  it('replays duplicate deliveries without advancing the conversation or creating a second order',async()=>{
    await handle(message('у клуба','m1'));await handle(message('у клуба','m1'));
    expect(draft.stage).toBe('destination');
    await handle(message('больница','m2'));
    const confirm=`b:confirm:${draft.id}`;
    await handle(message(confirm,'c1'));await handle(message(confirm,'c1'));await handle(message(confirm,'c2'));
    expect(mocks.inject).toHaveBeenCalledTimes(1);
  });
  it('shows the actual tariff and requires confirmation',async()=>{
    mocks.resolve.mockImplementation(async(raw:string)=>({id:raw,label:raw,houseNumber:'10',coordinates:{latitude:56,longitude:52}}));
    mocks.inject.mockResolvedValueOnce({statusCode:200,json:()=>({data:{quoteToken:'signed-fixed',tariffs:[{code:'economy',priceMinor:25000}]}})});
    await handle(message('Советская 10 → Ачинцева 5'));
    expect(replyText()).toContain('250 ₽');expect(draft.quoteToken).toBe('signed-fixed');
    expect(mocks.inject).toHaveBeenCalledTimes(1);expect(mocks.signQuote).not.toHaveBeenCalled();
  });
  it('refreshes an expired quote and rejects the older card after refresh',async()=>{
    await handle(message('у клуба → у дома'));
    draft.quotedAt=Date.now()-300000;
    const stale=`b:confirm:${draft.id}`;
    await handle(message(stale,'c1'));
    expect(replyText()).toContain('Расчёт обновлён');expect(mocks.inject).not.toHaveBeenCalled();
    await handle(message(stale,'c2'));expect(replyText()).toContain('устарела');expect(mocks.inject).not.toHaveBeenCalled();
  });
  it('keeps the draft on failed order creation and retries with the same idempotency key',async()=>{
    await handle(message('у клуба → у дома'));const confirm=`b:confirm:${draft.id}`;
    mocks.inject.mockResolvedValueOnce({statusCode:503,json:()=>({error:{message:'Попробуйте позже'}})});
    await handle(message(confirm,'c1'));expect(draft.stage).toBe('confirm');
    await handle(message(confirm,'c2'));
    expect(mocks.inject.mock.calls[0]![0].payload.idempotencyKey).toBe(mocks.inject.mock.calls[1]![0].payload.idempotencyKey);
    expect(draft.stage).toBe('done');
  });
  it('does not bypass a service restriction through manual pricing',async()=>{
    mocks.resolve.mockResolvedValue({id:'precise',label:'Советская 10',coordinates:{latitude:56,longitude:52}});
    mocks.inject.mockResolvedValue({statusCode:403,json:()=>({error:{code:'BOOKING_DISABLED',message:'Заказы отключены'}})});
    await handle(message('Советская 10 → Ачинцева 5'));
    expect(replyText()).toBe('Заказы отключены');expect(mocks.signQuote).not.toHaveBeenCalled();
  });
  it('does not authenticate a typed phone number',async()=>{
    mocks.firstRow.mockResolvedValue(null);await handle(message('+79990000000'));
    expect(mocks.phone).not.toHaveBeenCalled();expect(mocks.send.mock.calls[0]![1].reply_markup.keyboard[0][0].request_contact).toBe(true);
  });
  it('requests an own contact when an existing messenger account has no phone',async()=>{
    mocks.user.mockResolvedValue({id:'user',roles:['passenger']});
    await handle(message('такси'));
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
    await handle({...message('клуб → дом'),provider});expect(draft.stage).toBe('confirm');
    const reply=mocks.send.mock.calls.at(-1)![1];expect(reply.text??reply.message).toContain('Стоимость определит водитель');
  });
});
