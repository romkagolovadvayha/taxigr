import Fastify, {type FastifyInstance} from 'fastify';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({authenticate:vi.fn()}));
vi.mock('../server/security',()=>auth);
import {registerReadBatch} from '../server/read-batch';
import {readBatchPath} from '../src/api/read-batch-contract';
let app:FastifyInstance;
beforeEach(()=>{
  auth.authenticate.mockImplementation(async(req)=>{if(!req.headers.authorization)throw Object.assign(new Error('Unauthorized'),{statusCode:401});return {id:req.headers.authorization};});
  app=Fastify();registerReadBatch(app);
  app.get('/v1/me',async req=>({data:{user:(await auth.authenticate(req)).id}}));
  app.get('/v1/admin/test',async(req,reply)=>req.headers.authorization==='Bearer admin' ? {data:{secret:'admin-only'}} : reply.code(403).send({error:{code:'FORBIDDEN'}}));
  app.get('/v1/large',()=>({data:'a'.repeat(300_000)}));
});
afterEach(async()=>app.close());
const headers={authorization:'Bearer passenger'};
describe('additive read batch endpoint',()=>{
  it('retains the exact session and per-route permissions, including partial rejection',async()=>{
    const r=await app.inject({method:'POST',url:readBatchPath,headers,payload:{requests:[{id:'a',path:'/v1/me'},{id:'b',path:'/v1/admin/test'}]}});
    expect(r.statusCode).toBe(200);const results=r.json().data.results;
    expect(JSON.parse(results[0].body)).toEqual({data:{user:'Bearer passenger'}});expect(results[1].status).toBe(403);
  });
  it('does not alter an older client GET route or require new headers',async()=>{
    expect((await app.inject({method:'GET',url:'/v1/me',headers})).json()).toEqual({data:{user:'Bearer passenger'}});
  });
  it('requires authentication and rejects recursive, encoded-internal or mutating requests',async()=>{
    const unauth=await app.inject({method:'POST',url:readBatchPath,payload:{requests:[{id:'x',path:'/v1/me'}]}});expect(unauth.statusCode).toBe(401);
    for(const item of [{id:'x',path:readBatchPath},{id:'x',path:'/v1/%69nternal/secret'},{id:'x',path:'/v1/orders',method:'POST'},{id:'x',path:'https://outside/v1/me'}]){
      const r=await app.inject({method:'POST',url:readBatchPath,headers,payload:{requests:[item]}});expect(r.statusCode).toBe(400);
    }
  });
  it('bounds batch length and response volume without truncating other readers',async()=>{
    const tooMany=await app.inject({method:'POST',url:readBatchPath,headers,payload:{requests:Array.from({length:11},(_,i)=>({id:String(i),path:'/v1/me'}))}});expect(tooMany.statusCode).toBe(400);
    const r=await app.inject({method:'POST',url:readBatchPath,headers,payload:{requests:[{id:'large',path:'/v1/large'},{id:'small',path:'/v1/me'}]}});
    expect(r.json().data.results.map((v:{status:number})=>v.status)).toEqual([413,200]);
  });
});
