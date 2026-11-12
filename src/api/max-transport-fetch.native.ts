import { requireOptionalNativeModule } from 'expo-modules-core';
type NativeTransport = {
  request(id:string,url:string,method:string,headers:Record<string,string>,body:string|null):Promise<{status:number;body:string}>;
  cancel(id:string):void;
};
const native = requireOptionalNativeModule<NativeTransport>('TaxigrMaxTls');
let sequence = 0;
export const maxTransportFetch:typeof fetch = async (input, options) => {
  const url=String(input), target=new URL(url);
  if (target.protocol !== 'https:' || target.hostname !== 'platform-api2.max.ru' || target.port && target.port !== '443' || target.username || target.password || target.hash) throw new Error('MAX_TLS_HOST_DENIED');
  if (!native) return fetch(input,options);
  const id=`max-${Date.now()}-${++sequence}`;
  if (options?.signal?.aborted) throw new DOMException('Aborted','AbortError');
  const abort=()=>native.cancel(id);
  options?.signal?.addEventListener('abort',abort,{once:true});
  try {
    const headers:Record<string,string>={};
    new Headers(options?.headers).forEach((value,key)=>{headers[key]=value;});
    const response=await native.request(id,url,options?.method ?? 'GET',headers,typeof options?.body === 'string' ? options.body : null);
    if (options?.signal?.aborted) throw new DOMException('Aborted','AbortError');
    return new Response(response.body || null,{status:response.status});
  } finally { options?.signal?.removeEventListener('abort',abort); }
};
