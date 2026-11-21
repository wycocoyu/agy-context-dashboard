// Read-only bounded reader for Antigravity swarm member metadata under brainRoot.
// Confines reads via realpath and discards workspace paths and raw prompts.
import {readFile,realpath,stat} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {formatModelName} from './context.mjs';
import {normalizeConversationId} from './delegation.mjs';

const contains=(root,file)=>{const r=relative(root,file);return r!==''&&!r.startsWith('..')&&!isAbsolute(r);};
const ROLES=new Set(['coordinator','worker','monitor','sidecar']);

export function cleanAgentLabel(value,maxLen=32){
 if(typeof value!=='string')return '';
 const stripped=value.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,'').trim();
 if(!stripped||/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(stripped)||/[\\/:]/.test(stripped))return '';
 const safe=stripped.replace(/[^a-zA-Z0-9._()# -]/g,'').trim();
 return safe?safe.slice(0,maxLen):'';
}

export function classifyAgentRole({isRoot=false,memberName='',memberRole='',subagentSpec=null,agentScript=null,sourceMetadata=null}={}){
 if(sourceMetadata?.sidecar)return 'sidecar';
 const tags=[memberName,memberRole,subagentSpec?.typeName,subagentSpec?.role,agentScript?.name].filter(v=>typeof v==='string').join(' ');
 if(/\b(?:monitor|swarm[-_\s]?monitor|watchdog|guardian)\b/i.test(tags))return 'monitor';
 const mr=typeof memberRole==='string'?memberRole.trim().toLowerCase():'';
 if(mr==='coordinator'||isRoot)return 'coordinator';
 return 'worker';
}

export async function readSwarmMembers(brainRoot,conversationId,{maxBytes=512*1024}={}){
 if(typeof brainRoot!=='string'||!brainRoot)return null;
 const swarmId=normalizeConversationId(conversationId);
 if(!swarmId)return null;
 let root;
 try{root=await realpath(brainRoot);}catch{return null;}
 const candidate=join(brainRoot,swarmId,'.system_generated','swarm','members.json');
 const expected=join(root,swarmId,'.system_generated','swarm','members.json');
 let file,info;
 try{
  file=await realpath(candidate);
  const norm=p=>process.platform==='win32'?p.toLowerCase():p;
  if(!contains(root,file)||norm(file)!==norm(expected))return null;
  info=await stat(file);
  if(!info.isFile()||info.size>maxBytes)return null;
 }catch{return null;}
 let raw;
 try{
  const text=await readFile(file,'utf8');
  if(Buffer.byteLength(text)>maxBytes)return null;
  raw=JSON.parse(text);
 }catch{return null;}
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!raw.members||typeof raw.members!=='object'||Array.isArray(raw.members))return null;
 const byId=new Map();
 for(const [name,member]of Object.entries(raw.members)){
  if(byId.size>=128)break;
  if(!member||typeof member!=='object'||Array.isArray(member))continue;
  const cid=normalizeConversationId(member.conversation_id);
  if(!cid)continue;
  const cleanName=cleanAgentLabel(name,28);
  const role=classifyAgentRole({isRoot:member.role==='coordinator',memberName:cleanName,memberRole:member.role});
  const modelRaw=member.applied_model||member.model||member.desired_model||'';
  const model=typeof modelRaw==='string'?(formatModelName(modelRaw)||''):'';
  const workspaceMode=['inherit','share','branch'].includes(member.workspace_mode)?member.workspace_mode:null;
  byId.set(cid,{id:cid,name:cleanName,role,model,workspaceMode,killed:member.killed===true});
 }
 return byId.size?{swarmId,byId,ids:[...byId.keys()]}:null;
}

export function agentDescriptor(conversationId,{isRoot=false,summaries={},swarmMembers=null}={}){
 const cid=normalizeConversationId(conversationId);
 const sum=cid?(summaries[cid]??Object.entries(summaries).find(([k])=>k.toLowerCase()===cid)?.[1]??null):null;
 const meta=sum?.trajectoryMetadata||null;
 const sm=cid&&swarmMembers?.byId?.get(cid)||null;
 const role=classifyAgentRole({
  isRoot,memberName:sm?.name,memberRole:sm?.role,
  subagentSpec:meta?.subagentSpec,agentScript:meta?.agentScript,sourceMetadata:meta?.sourceMetadata,
 });
 if(!ROLES.has(role))return {role:'worker',label:'Worker',modelHint:''};
 const scriptName=cleanAgentLabel(meta?.agentScript?.name,28);
 const specRole=cleanAgentLabel(meta?.subagentSpec?.role||meta?.subagentSpec?.typeName,32);
 const baseName=sm?.name||scriptName||specRole;
 let label='Worker';
 if(role==='coordinator')label='Coordinator';
 else if(role==='sidecar')label=baseName?`Sidecar (${baseName})`:'Sidecar';
 else if(role==='monitor')label=baseName?`Monitor (${baseName})`:'Monitor';
 else label=baseName?`Worker (${baseName})`:'Worker';
 const rawModel=sm?.model||meta?.subagentSpec?.model||'';
 const modelHint=typeof rawModel==='string'?(formatModelName(rawModel)||''):'';
 return {role,label:cleanAgentLabel(label,40)||'Worker',modelHint};
}
