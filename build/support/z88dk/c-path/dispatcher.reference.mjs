import { WASI } from 'node:wasi'
import { readdirSync, readFileSync, openSync, closeSync, appendFileSync, copyFileSync, existsSync } from 'node:fs'
const DIR='/tmp/zxbuild', B='/home/mikolaj/src/madside-zx/_notes/z88dk-wasm-spike/build'
// collapse '.', '..', '//' in the absolute-path portion of a token (WASI rejects '..')
function normPathPart(tok){
  const i = tok.indexOf('/')
  if(i<0) return tok
  const pre = tok.slice(0,i), path = tok.slice(i)
  const abs = path.startsWith('/')
  const out=[]
  for(const seg of path.split('/')){
    if(seg===''||seg==='.') continue
    if(seg==='..'){ if(out.length) out.pop() } else out.push(seg)
  }
  return pre + (abs?'/':'') + out.join('/')
}
const TOOLS = {
  'z88dk-ucpp': B+'/zcpp.wasm', 'z88dk-sccz80': B+'/sccz80.wasm',
  'z88dk-z80asm': B+'/z80asm.wasm', 'z88dk-appmake': B+'/appmake.wasm', 'z88dk-zpragma': B+'/zpragma.wasm',
}
const PASS = new Set(['z88dk-copt'])   // passthrough stdin→stdout
const modCache={}
const mod = p => (modCache[p] ??= new WebAssembly.Module(readFileSync(p)))
// run a sub-tool wasm with optional file stdin/stdout
function runTool(wasmPath, argv, inFile, outFile){
  const opts={ version:'preview1', args:argv, env:{}, preopens:{'/':DIR} }
  let inFd,outFd
  if(inFile){ inFd=openSync(DIR+inFile,'r'); opts.stdin=inFd }
  if(outFile){ outFd=openSync(DIR+outFile,'w'); opts.stdout=outFd }
  const errFd=openSync('/tmp/tool.err','w'); opts.stderr=errFd
  const w=new WASI(opts)
  try{ const inst=new WebAssembly.Instance(mod(wasmPath), w.getImportObject()); return w.start(inst)??0 }
  catch(e){ return e?.code ?? 1 }
  finally{ if(inFd!==undefined)closeSync(inFd); if(outFd!==undefined)closeSync(outFd); closeSync(errFd) }
}
// tokenize a shell-ish command: quotes + redirections
function parse(cmd){
  const toks=[]; { let cur='', q=false, has=false
    for(const ch of cmd){
      if(ch==='"'){ q=!q; has=true }
      else if(!q && /\s/.test(ch)){ if(has){toks.push(cur); cur=''; has=false} }
      else { cur+=ch; has=true }
    }
    if(has) toks.push(cur)
  }
  const toks2=toks.filter(t=>t!=='(null)')
  const args=[]; let inF=null,outF=null,append=false
  for(let i=0;i<toks2.length;i++){
    if(toks2[i]==='<'){ inF=toks2[++i] }
    else if(toks2[i]==='>'){ outF=toks2[++i] }
    else if(toks2[i]==='>>'){ outF=toks2[++i]; append=true }
    else args.push(toks2[i])
  }
  return {args:args.map(normPathPart), inF:inF&&normPathPart(inF), outF:outF&&normPathPart(outF), append}
}
let mainInst
const wasi=new WASI({ version:'preview1', args:['zcc',...process.argv.slice(2)],
  env:{ ZCCCFG:'/z88dk/lib/config', TMPDIR:'/tmp', HOME:'/', PATH:'/' }, preopens:{'/':DIR} })
const imp={ ...wasi.getImportObject(), env:{ run:(p)=>{
  const m=new Uint8Array(mainInst.exports.memory.buffer); let e=p; while(m[e])e++
  const cmd=Buffer.from(m.slice(p,e)).toString()
  console.error('CMD['+cmd.length+']: '+cmd)
  try{ const zo=cmd.match(/-zcc-opt="?([^"\\s]+)/); if(zo) console.error('    [probe] '+zo[1]+' exists='+existsSync(DIR+zo[1])+' | /tmp ls='+JSON.stringify(readdirSync(DIR+'/tmp'))) }catch(e){ console.error('    [probe-err]',e.message) }
  const {args,inF,outF,append}=parse(cmd)
  const tool=args[0]
  try{
    if(tool==='cat'){ // cat SRC (>>|>) DST  — DST is outF
      const src=args[1]
      if(append) appendFileSync(DIR+outF, readFileSync(DIR+src))
      else copyFileSync(DIR+src, DIR+outF)
      return 0
    }
    if(PASS.has(tool)){ console.error('  [PASS]',tool,'inF='+inF+' outF='+outF)
      if(inF&&outF) copyFileSync(DIR+inF, DIR+outF)
      return 0
    }
    if(args.includes('-b')){ for(const a of args){ if(a.endsWith('.o')){ let has=false; try{has=readFileSync(DIR+a).includes('_main')}catch{}; console.error('  [link.o]',a,'exists='+existsSync(DIR+a),'has_main='+has) } } }
    if(!args.includes('-b')){ for(const a of args){ if(a.endsWith('.asm')){ let t=''; try{t=readFileSync(DIR+a,'utf8')}catch{}; console.error('  [asm.in]',a,'lines='+t.split('\n').length+' hasGLOBALmain='+/GLOBAL\s+_main/.test(t)+' hasDotMain='+/\._main/.test(t)) } } }
    if(tool==='z88dk-ucpp') console.error('  [ucpp args]', JSON.stringify(args))
    const wp=TOOLS[tool]
    if(!wp){ console.error('  [dispatch] UNKNOWN tool:',tool,'|',cmd.slice(0,120)); return 127 }
    const rc=runTool(wp, args, inF, outF)
    { const oi=args.indexOf('-o'); if(oi>=0&&args[oi+1]){ let n=0;try{n=readFileSync(DIR+args[oi+1],'utf8').split('\n').length}catch{}; console.error('  [-o]',tool,args[oi+1],'lines='+n) } }
    if(outF){ let n=0; try{n=readFileSync(DIR+outF,'utf8').split('\n').length}catch{}; console.error('  [out]',tool,outF,'lines='+n+' rc='+rc) }
    if(rc!==0){ console.error('  [dispatch]',tool,'rc='+rc); try{console.error('  STDERR:',require('fs').readFileSync('/tmp/tool.err','utf8').slice(0,500))}catch{} }
    return rc
  }catch(err){ console.error('  [dispatch] ERR',tool,err.message,'|',cmd.slice(0,120)); return 1 }
}}}
mainInst=new WebAssembly.Instance(mod(B+'/zcc.wasm'), imp)
let rc; try{ rc=wasi.start(mainInst) }catch(e){ rc='threw:'+e?.message }
console.log('=== zcc exit:',rc,'===')
console.log('hello binary exists?', existsSync(DIR+'/hello')?'YES':'NO', existsSync(DIR+'/hello.tap')?'(+ .tap)':'')
