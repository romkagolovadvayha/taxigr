import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from './security';
import { isBatchableReadPath, readBatchMaxRequests, readBatchPath, type BatchedReadResult } from '../src/api/read-batch-contract';

const bodySchema = z.strictObject({ requests:z.array(z.strictObject({
  id:z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/), path:z.string().refine(isBatchableReadPath),
})).min(1).max(readBatchMaxRequests) }).refine(value=>new Set(value.requests.map(item=>item.id)).size === value.requests.length);

/** Additive endpoint: old clients keep their individual GETs and existing response shapes. */
export function registerReadBatch(app: FastifyInstance) {
  app.post(readBatchPath, async request => {
    await authenticate(request);
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) throw Object.assign(new Error('Некорректный пакет чтения'),{statusCode:400,code:'READ_BATCH_INVALID'});
    const results: BatchedReadResult[] = [];
    let responseBytes = 0;
    // Keep DB/API concurrency bounded. Every subrequest goes through its original
    // authorization, permission checks and limits with the same session.
    for (const item of parsed.data.requests) {
      const response = await app.inject({method:'GET',url:item.path,headers:{authorization:request.headers.authorization!},remoteAddress:request.ip});
      const bytes = Buffer.byteLength(response.body);
      if (bytes > 256_000 || responseBytes+bytes > 512_000) {
        results.push({id:item.id,status:413,body:JSON.stringify({error:{code:'READ_BATCH_RESPONSE_TOO_LARGE',message:'Получите эти данные отдельным запросом'}})});
      } else {
        responseBytes += bytes; results.push({id:item.id,status:response.statusCode,body:response.body});
      }
    }
    return {data:{results}};
  });
}
