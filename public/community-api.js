import {CommunityAPI} from './api.js?v=community-4';
import {CONFIG} from './config.js?v=community-4';
export class HubAPI extends CommunityAPI{
 async messages(){return this.request('/rest/v1/community_messages?select=id,user_id,display_name,body,created_at&order=created_at.desc&limit=100');}
 async models(page=0){return this.request('/rest/v1/community_models?select=id,user_id,display_name,title,description,license,file_path,byte_size,created_at&order=created_at.desc,id.desc&limit=13&offset='+page*12);}
 modelURL(path){if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.glb$/.test(path))throw Error('Invalid model path.');return CONFIG.supabaseUrl+'/storage/v1/object/public/community-models/'+path;}
 async write(data){try{this.session=JSON.parse(localStorage.getItem('incased-session'));}catch{this.session=null;}await this.refresh();if(!this.session?.access_token)throw Error('Sign in to join the community.');const multipart=data instanceof FormData;const response=await fetch(CONFIG.supabaseUrl+'/functions/v1/community',{method:'POST',headers:{apikey:CONFIG.publishableKey,Authorization:'Bearer '+this.session.access_token,...(multipart?{}:{'Content-Type':'application/json'})},body:multipart?data:JSON.stringify(data),signal:AbortSignal.timeout(multipart?90000:15000)});const result=await response.json().catch(()=>({}));if(!response.ok){if(response.status===401){this.session=null;localStorage.removeItem('incased-session');window.dispatchEvent(new Event('community-auth-change'));}throw Error(result.message||'Unable to save. Please try again.');}return result;}
}
