export const MAX_MODEL_BYTES=15*1024*1024;
export function validateGLB(buffer){
 if(buffer.byteLength<28||buffer.byteLength>MAX_MODEL_BYTES)throw Error('Choose a GLB model up to 15 MB.');
 const v=new DataView(buffer);if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==buffer.byteLength)throw Error('This file is not a valid GLB 2.0 model.');
 let offset=12,json,bin=0;while(offset<buffer.byteLength){if(offset+8>buffer.byteLength)throw Error('Incomplete GLB chunk.');const size=v.getUint32(offset,true),type=v.getUint32(offset+4,true);offset+=8;if(size%4||offset+size>buffer.byteLength)throw Error('Invalid GLB chunk.');if(type===0x4e4f534a){if(json||offset!==20||size>2*1024*1024)throw Error('Invalid GLB metadata.');try{json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,offset,size)));}catch{throw Error('Unreadable GLB metadata.');}}else if(type===0x004e4942){bin+=size;}else throw Error('Unsupported GLB chunk.');offset+=size;}
 if(!json||json.asset?.version!=='2.0'||!json.meshes?.length||!bin)throw Error('The GLB must contain a mesh and embedded model data.');
 for(const entry of [...(json.buffers||[]),...(json.images||[])])if(entry.uri)throw Error('Embed all textures and buffers in the GLB before uploading.');
 if((json.extensionsRequired||[]).some(e=>!['KHR_materials_unlit','KHR_materials_clearcoat','KHR_materials_transmission','KHR_materials_ior','KHR_materials_sheen','KHR_materials_specular','KHR_materials_emissive_strength','KHR_materials_iridescence','KHR_materials_volume','KHR_materials_anisotropy','KHR_texture_transform','KHR_mesh_quantization','EXT_mesh_gpu_instancing','KHR_lights_punctual'].includes(e)))throw Error('Export a standard GLB without Draco, Meshopt or compressed textures.');
 if((json.buffers||[]).length!==1||json.buffers[0].byteLength>bin)throw Error('Invalid embedded buffer.');
 for(const b of json.bufferViews||[])if(b.buffer!==0||!Number.isInteger(b.byteLength)||b.byteLength<0||(b.byteOffset||0)<0||(b.byteOffset||0)+b.byteLength>bin)throw Error('Invalid GLB buffer view.');
 let vertices=0;for(const mesh of json.meshes)for(const p of mesh.primitives||[]){const a=json.accessors?.[p.attributes?.POSITION];if(!a||!Number.isInteger(a.count)||a.count<1)throw Error('A mesh has no valid vertices.');vertices+=a.count;}
 if(vertices>1500000||(json.nodes||[]).length>10000)throw Error('Please simplify this model before uploading (maximum 1.5 million vertices).');return json;
}
