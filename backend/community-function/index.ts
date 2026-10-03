import {validateGLB,MAX_MODEL_BYTES} from './glb-validation.js';
const base=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers={'Access-Control-Allow-Origin':'https://incasedgames.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Vary':'Origin'};
class ClientError extends Error{constructor(message:string,public status=400){super(message);}}
async function boundedBody(req:Request,max:number){if(Number(req.headers.get('content-length')||0)>max)throw new ClientError('Upload is too large.',413);const reader=req.body?.getReader();if(!reader)throw new ClientError('Missing request.');let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new ClientError('Upload is too large.',413);}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
async function admin(path:string,options:RequestInit={}){const r=await fetch(base+path,{...options,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(30000)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=null;}if(!r.ok){if(data?.code==='P0001')throw new ClientError(data.message,429);if(data?.code==='23514'||data?.code==='22P02'||data?.code==='23502')throw new ClientError('Check the title, description, licence and message length.');throw new ClientError('Unable to save right now. Please try again.',503);}return data;}
async function action(user:string,name:string,data:unknown={}){return await admin('/rest/v1/rpc/community_write',{method:'POST',body:JSON.stringify({p_user_id:user,p_action:name,p_data:data})});}
async function removeFile(path:string){await admin('/storage/v1/object/community-models',{method:'DELETE',body:JSON.stringify({prefixes:[path]})});}
export async function handler(req:Request){
 const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return respond({message:'Use POST.'},405);
 if(req.headers.get('origin')&&req.headers.get('origin')!=='https://incasedgames.github.io')return respond({message:'Origin not allowed.'},403);
 try{
  const token=req.headers.get('authorization')||'';if(!/^Bearer [A-Za-z0-9._-]+$/.test(token))throw new ClientError('Sign in to join the community.',401);
  const verify=await fetch(base+'/auth/v1/user',{headers:{apikey:service,Authorization:token},signal:AbortSignal.timeout(10000)});
  if(!verify.ok)throw new ClientError('Your session expired. Please sign in again.',401);const user=await verify.json();if(!user.id||user.is_anonymous||!user.email_confirmed_at)throw new ClientError('Sign in with a verified account.',401);
  const actionFor=(name:string,data:Record<string,unknown>={})=>action(user.id,name,{...data,_display_name:user.user_metadata?.user_name||user.user_metadata?.preferred_username||'Player'});
  if(req.headers.get('content-type')?.startsWith('multipart/form-data')){
   const bytes=await boundedBody(req,MAX_MODEL_BYTES+16384);const form=await new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')!}}).formData();const file=form.get('file');
   if(!(file instanceof File)||!file.name.toLowerCase().endsWith('.glb'))throw new ClientError('Choose a .glb model.');
   const model=await file.arrayBuffer();validateGLB(model);
   const reserved=await actionFor('reserve',{title:form.get('title'),description:form.get('description'),license:form.get('license'),rights:form.get('rights')==='true',byte_size:model.byteLength});
   try{
    await admin('/storage/v1/object/community-models/'+reserved.file_path,{method:'POST',headers:{'Content-Type':'model/gltf-binary','cache-control':'3600','x-upsert':'false'},body:model});
    await actionFor('publish',{id:reserved.id});return respond({id:reserved.id},201);
   }catch(error){await actionFor('cancel',{id:reserved.id}).catch(()=>{});await removeFile(reserved.file_path).catch(()=>{});throw error;}
  }
  const bytes=await boundedBody(req,8192);let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ClientError('Invalid request.');}
  if(!['message','session','remove_message','remove_model'].includes(data.action))throw new ClientError('Unknown action.');
  const result=await actionFor(data.action,data);
  if(data.action==='remove_model')await removeFile(result.file_path);
  return respond(result);
 }catch(error){const status=error instanceof ClientError?error.status:400;const message=error instanceof ClientError?error.message:error instanceof Error&&/GLB|mesh|vertices|textures|model|buffer|chunk|metadata|Draco/.test(error.message)?error.message:'Unable to complete this request. Please try again.';return respond({message},status);}
}
Deno.serve(handler);
