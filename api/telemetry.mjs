import {NodeTracerProvider,SimpleSpanProcessor} from '@opentelemetry/sdk-trace-node';
import {MeterProvider,MetricReader} from '@opentelemetry/sdk-metrics';
import {SpanStatusCode,context,trace} from '@opentelemetry/api';
class LocalMetricReader extends MetricReader { async onShutdown() {} async onForceFlush() {} }

// Local, bounded in-memory exporter. No network exporter and no request bodies or secrets.
export function createLocalTelemetry(){
 const spans=[];
 const exporter={export(batch,done){for(const span of batch){spans.push({name:span.name,traceId:span.spanContext().traceId,spanId:span.spanContext().spanId,parentSpanId:span.parentSpanContext?.spanId??null,attributes:span.attributes,status:span.status,durationMs:Math.round((span.duration[0]*1000+span.duration[1]/1e6)*100)/100});if(spans.length>200)spans.shift();}done({code:0});},shutdown:async()=>{}};
 const traceProvider=new NodeTracerProvider({spanProcessors:[new SimpleSpanProcessor(exporter)]});
 const tracer=traceProvider.getTracer('actionledger','0.2.0');
 const reader=new LocalMetricReader();const meterProvider=new MeterProvider({readers:[reader]});const meter=meterProvider.getMeter('actionledger','0.2.0');
 const requests=meter.createCounter('actionledger.http.requests');const duration=meter.createHistogram('actionledger.http.duration',{unit:'ms'});const outcomes=meter.createCounter('actionledger.security.outcomes');const modelCalls=meter.createCounter('actionledger.model.calls');const modelDuration=meter.createHistogram('actionledger.model.duration',{unit:'ms'});const modelTokens=meter.createCounter('actionledger.model.tokens');
 const rss=meter.createObservableGauge('actionledger.process.memory.rss',{unit:'By',description:'Resident memory of the API process'});rss.addCallback(result=>result.observe(process.memoryUsage().rss));
 const heap=meter.createObservableGauge('actionledger.process.memory.heap_used',{unit:'By',description:'Used JavaScript heap of the API process'});heap.addCallback(result=>result.observe(process.memoryUsage().heapUsed));
 const cpu=meter.createObservableCounter('actionledger.process.cpu.time',{unit:'s',description:'Cumulative CPU time used by the API process'});cpu.addCallback(result=>{const usage=process.cpuUsage();result.observe(usage.user/1e6,{mode:'user'});result.observe(usage.system/1e6,{mode:'system'});});
 function startRequest(method,route){return tracer.startSpan('http.request',{attributes:{'http.request.method':method,'http.route':route}});}
 function endRequest(span,status,ms){span.setAttribute('http.response.status_code',status);if(status>=500)span.setStatus({code:SpanStatusCode.ERROR});span.end();requests.add(1,{'http.request.method':span.attributes['http.request.method'],'http.response.status_code':status});duration.record(ms,{'http.request.method':span.attributes['http.request.method']});}
 function parentContext(parent){return parent?trace.setSpan(context.active(),parent):context.active();}
 function recordSecurity(action,outcome,parent){outcomes.add(1,{action,outcome});const s=tracer.startSpan('security.decision',{attributes:{action,outcome}},parentContext(parent));s.end();}
 function event(name,attributes={},parent){const span=tracer.startSpan(name,{attributes},parentContext(parent));span.end();}
 async function modelCall(fn,parent){const started=performance.now();const span=tracer.startSpan('agent.analysis',{},parentContext(parent));let outcome='ok';try{const result=await fn();if(Number.isFinite(result.inputTokens)&&result.inputTokens>=0)modelTokens.add(result.inputTokens,{direction:'input'});if(Number.isFinite(result.outputTokens)&&result.outputTokens>=0)modelTokens.add(result.outputTokens,{direction:'output'});return result;}catch(error){outcome='error';span.setStatus({code:SpanStatusCode.ERROR});throw error;}finally{const ms=performance.now()-started;span.setAttribute('outcome',outcome);span.end();modelCalls.add(1,{outcome});modelDuration.record(ms,{outcome});}}
 async function snapshot(){const collected=await reader.collect();return {traces:spans.slice(-100),metrics:collected.resourceMetrics.scopeMetrics.flatMap(s=>s.metrics).map(m=>({name:m.descriptor.name,dataPoints:m.dataPoints})),scope:'local-memory-only'};}
 async function close(){await traceProvider.shutdown();await meterProvider.shutdown();}
 return {startRequest,endRequest,recordSecurity,event,modelCall,snapshot,close};
}
