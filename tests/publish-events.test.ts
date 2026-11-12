import {afterEach,describe,expect,it,vi} from 'vitest';
import {createRoomPublisher} from '../server/publish-events';
import {RealtimeEvents} from '../server/realtime-events';
afterEach(()=>vi.useRealTimers());
describe('one logical event for overlapping audiences',()=>{
  it('emits one Socket.IO room union and one relay event for an admin passenger',async()=>{
    const events=new RealtimeEvents(),cursor=events.read(undefined,new Set(['user:a','admins'])).cursor;
    const emit=vi.fn((rooms:string[],event:string,payload:unknown)=>events.publishTo(rooms,event,payload));
    const publish=createRoomPublisher(emit),message={id:'chat-1',text:'test'};
    publish('user:a','ride-chat:message',message);publish('user:b','ride-chat:message',message);publish('admins','ride-chat:message',message);
    await Promise.resolve();expect(emit).toHaveBeenCalledOnce();expect(events.read(cursor,new Set(['user:a','admins'])).events).toHaveLength(1);
    expect(events.read(cursor,new Set(['user:outsider'])).events).toHaveLength(0);
  });
  it('takes a stable payload snapshot and never merges differently redacted data',async()=>{
    const emit=vi.fn(),publish=createRoomPublisher(emit),payload:{id:string;phone?:string}={id:'ride'};
    publish('user:a','order:updated',payload);payload.phone='private-test';publish('admins','order:updated',payload);
    await Promise.resolve();expect(emit).toHaveBeenCalledTimes(2);expect(emit.mock.calls[0]?.[2]).toEqual({id:'ride'});expect(emit.mock.calls[1]?.[2]).toHaveProperty('phone');
    publish('admins','order:updated',payload);await Promise.resolve();expect(emit).toHaveBeenCalledTimes(3);
  });
  it('expires an idle event log and requests a snapshot instead of replaying stale state',()=>{
    vi.useFakeTimers();const events=new RealtimeEvents(),cursor=events.read(undefined,new Set(['user:a'])).cursor;
    events.publish('user:a','order:updated',{id:'old'});vi.advanceTimersByTime(301_000);
    const result=events.read(cursor,new Set(['user:a']));expect(result.reset).toBe(true);expect(result.events).toEqual([]);
    expect(events.read(result.cursor,new Set(['user:a'])).reset).toBe(false);
  });
});
