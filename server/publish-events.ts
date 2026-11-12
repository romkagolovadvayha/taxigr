type Emit = (rooms:string[],event:string,payload:unknown)=>void;
/** Socket.IO room union prevents double notifications for an admin who is also a passenger. */
export function createRoomPublisher(emit:Emit) {
  const pending=new Map<string,{rooms:Set<string>;event:string;payload:unknown}>();
  let scheduled=false;
  return (room:string,event:string,payload:unknown)=>{
    const serialized=JSON.stringify(payload);
    const key=JSON.stringify([event,serialized]);
    let entry=pending.get(key);
    if (!entry) {entry={rooms:new Set(),event,payload:serialized === undefined ? undefined : JSON.parse(serialized)};pending.set(key,entry);}
    entry.rooms.add(room);
    if (!scheduled) {
      scheduled=true;queueMicrotask(()=>{
        const entries=[...pending.values()];pending.clear();scheduled=false;
        for(const entry of entries)emit([...entry.rooms],entry.event,entry.payload);
      });
    }
  };
}
