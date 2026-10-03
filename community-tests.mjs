import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateGLB} from './public/glb-validation.js';
const bytes=fs.readFileSync('public/models/ashen-longsword.glb');const model=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
assert(validateGLB(model).meshes.length);
assert.throws(()=>validateGLB(new TextEncoder().encode('<html>not a model</html>').buffer),/GLB/);
const corrupt=model.slice(0);new DataView(corrupt).setUint32(8,100,true);assert.throws(()=>validateGLB(corrupt),/valid GLB/);
function glb(json){let str=JSON.stringify(json);str+=' '.repeat((4-str.length%4)%4);const chunk=Buffer.from(str),bin=Buffer.alloc(36),b=Buffer.alloc(28+chunk.length+bin.length);b.writeUInt32LE(0x46546c67,0);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(chunk.length,12);b.writeUInt32LE(0x4e4f534a,16);chunk.copy(b,20);b.writeUInt32LE(bin.length,20+chunk.length);b.writeUInt32LE(0x004e4942,24+chunk.length);bin.copy(b,28+chunk.length);return b.buffer.slice(b.byteOffset,b.byteOffset+b.length);}
const tiny={asset:{version:'2.0'},buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{count:3}],meshes:[{primitives:[{attributes:{POSITION:0}}]}]};
assert(validateGLB(glb(tiny)));
assert.throws(()=>validateGLB(glb({...tiny,images:[{uri:'https://example.com/track.png'}]})),/Embed/);
assert.throws(()=>validateGLB(glb({...tiny,extensionsRequired:['KHR_draco_mesh_compression']})),/standard GLB/);
assert.throws(()=>validateGLB(glb({...tiny,accessors:[{count:1600000}]})),/simplify/);
// Exercise the actual Edge handler with verified and rejected sessions, including
// Storage upload/publication and cleanup after a failed upload. No live posts.
globalThis.Deno={env:{get:name=>name==='SUPABASE_URL'?'https://testproject.supabase.co':'server-test-key'},serve:()=>{}};
const {handler}=await import('./backend/community-function/index.ts');let writes=[],failStorage=false,rejectUser=false;
globalThis.fetch=async(url,opts)=>{url=String(url);if(url.endsWith('/auth/v1/user'))return Response.json(rejectUser?{message:'bad token'}:{id:'verified-id',email_confirmed_at:'2026-10-03',user_metadata:{user_name:'Verified player'}},{status:rejectUser?401:200});writes.push({url,...opts});if(url.includes('/rpc/community_write')){const request=JSON.parse(opts.body);assert.equal(request.p_user_id,'verified-id');assert.equal(request.p_data._display_name,'Verified player');return Response.json(request.p_action==='reserve'?{id:'model-id',file_path:'verified-id/model-id.glb'}:{id:'model-id'});}if(url.includes('/storage/v1/object/'))return Response.json(failStorage&&opts.method==='POST'?{message:'failure'}:{},{status:failStorage&&opts.method==='POST'?500:200});throw Error('Unexpected request: '+url);};
function request(body,auth=true){return new Request('https://testproject.supabase.co/functions/v1/community',{method:'POST',headers:{Origin:'https://incasedgames.github.io',...(auth?{Authorization:'Bearer verified-token'}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:JSON.stringify(body)});}
assert.equal((await handler(request({action:'message',body:'Hello'},false))).status,401);assert.equal(writes.length,0);
rejectUser=true;assert.equal((await handler(request({action:'message',body:'Hello'}))).status,401);assert.equal(writes.length,0);rejectUser=false;
assert.equal((await handler(request({action:'message',body:'Hello',_display_name:'Spoofed name'}))).status,200);assert.equal(writes.length,1);writes=[];
const form=new FormData();form.set('file',new File([model],'knight.glb'));form.set('title','Knight model');form.set('description','A model made by its creator.');form.set('license','CC BY-NC 4.0');form.set('rights','true');
assert.equal((await handler(request(form))).status,201);assert.deepEqual(writes.filter(w=>w.url.includes('/rpc/')).map(w=>JSON.parse(w.body).p_action),['reserve','publish']);assert(writes.some(w=>w.headers['Content-Type']==='model/gltf-binary'));writes=[];
failStorage=true;assert.equal((await handler(request(form))).status,503);assert.deepEqual(writes.filter(w=>w.url.includes('/rpc/')).map(w=>JSON.parse(w.body).p_action),['reserve','cancel']);assert(writes.some(w=>w.method==='DELETE'));writes=[];failStorage=false;
const bad=new FormData();bad.set('file',new File(['not a model'],'bad.glb'));assert.equal((await handler(request(bad))).status,400);assert.equal(writes.length,0);
const source=fs.readFileSync('public/community.js','utf8');assert(!source.includes('innerHTML'));assert(source.includes('textContent=text'));assert.equal(fs.readFileSync('backend/community-function/glb-validation.js','utf8'),fs.readFileSync('public/glb-validation.js','utf8'));
console.log('PASS: GLB integrity, external resources and geometry limits; verified Edge authentication, server-derived names, upload/publication and failed-upload cleanup; safe text rendering.');
