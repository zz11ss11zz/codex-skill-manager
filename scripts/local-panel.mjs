// Local read-only host for verifying the real dashboard when the desktop transport is closed.
import {createServer as createHttpServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/server.mjs';
const service=createServer();
const client=new Client({name:'local-readonly-panel',version:'1.0.0'});
const [a,b]=InMemoryTransport.createLinkedPair();
await service.connect(b); await client.connect(a);
const bridgeSource=(await readFile(new URL('./preview-host.mjs',import.meta.url),'utf8')).replaceAll('synthetic-test-host','local-readonly-host').replaceAll('Synthetic host','Local host');
const script=await build({stdin:{contents:bridgeSource,resolveDir:process.cwd(),sourcefile:'local-panel-host.mjs'},bundle:true,write:false,format:'esm',platform:'browser'});
const html=await readFile(new URL('../dist/dashboard.html',import.meta.url));
const page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>能力管理器 · 本地只读面板</title><style>body{font-family:system-ui;margin:0;background:#f5f7fa}header{padding:12px;font-size:13px}iframe{display:block;border:1px solid #dce2ea;max-width:100%;width:1060px;height:calc(100vh - 65px);margin:auto;background:white}button{padding:5px;margin-left:8px}</style><header><strong>真实本地记录 · 只读检查面板</strong><button id="narrow">窄面板</button><button id="wide">宽面板</button><span id="host-status"></span></header><iframe id="app" title="能力管理器面板"></iframe><script type="module" src="/bridge.js"></script></html>';
let origin;
const http=createHttpServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.headers.host!==new URL(origin).host){res.writeHead(403).end();return;}
  try {
    if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page);}
    else if(req.method==='GET'&&req.url==='/dashboard'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}
    else if(req.method==='GET'&&req.url==='/bridge.js'){res.setHeader('Content-Type','text/javascript');res.end(script.outputFiles[0].text);}
    else if(req.method==='POST'&&req.url==='/tool'&&req.headers.origin===origin&&req.headers['content-type']==='application/json'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>65536){res.writeHead(413).end();return;}}
      const params=JSON.parse(body);
      res.setHeader('Content-Type','application/json');
      if(!['open_skill_manager','query_usage'].includes(params.name)){res.end(JSON.stringify({isError:true,content:[{type:'text',text:'此检查面板只开放扫描和查询，不执行修改。'}]}));return;}
      res.end(JSON.stringify(await client.callTool(params)));
    } else res.writeHead(404).end();
  }catch{res.writeHead(500).end('Local panel error');}
});
await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
origin=`http://127.0.0.1:${http.address().port}`;console.log(origin);
async function stop(){http.closeAllConnections();http.close();await client.close();await service.close();process.exit(0);}
process.stdin.resume();process.stdin.on('data',data=>{if(data.toString().trim()==='q')stop();});
process.on('SIGINT',stop);process.on('SIGTERM',stop);
