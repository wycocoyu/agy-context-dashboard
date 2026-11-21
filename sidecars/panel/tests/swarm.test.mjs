import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cleanAgentLabel,classifyAgentRole,readSwarmMembers,agentDescriptor} from '../swarm.mjs';
import {delegatedIds} from '../delegation.mjs';

const coord='11111111-1111-1111-1111-111111111111';
const w1='22222222-2222-2222-2222-222222222222';
const w2='33333333-3333-3333-3333-333333333333';
const mon='44444444-4444-4444-4444-444444444444';

test('readSwarmMembers loads members securely, strips private workspaces/titles, and integrates with delegatedIds',async t=>{
  const root=await mkdtemp(join(tmpdir(),'ag-swarm-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const dir=join(root,coord,'.system_generated','swarm');await mkdir(dir,{recursive:true});
  const payload={title:'PRIVATE SWARM TITLE',members:{
    coordinator:{conversation_id:coord.toUpperCase(),role:'coordinator',model:'MODEL_PLACEHOLDER_M537',workspace_mode:'inherit',workspace:'/Users/mac/SECRET_PATH'},
    'feat-multi-16':{conversation_id:w1,role:'worker',applied_model:'MODEL_PLACEHOLDER_M669',workspace_mode:'share',workspace:'/Users/mac/SECRET_SHARE'},
    verifier:{conversation_id:w2,role:'worker',desired_model:'MODEL_PLACEHOLDER_M405',workspace_mode:'inherit',killed:true},
    'swarm-monitor':{conversation_id:mon,role:'worker',model:'MODEL_PLACEHOLDER_M318'},
  }};
  await writeFile(join(dir,'members.json'),JSON.stringify(payload));
  const swarm=await readSwarmMembers(root,coord);
  assert.ok(swarm);
  assert.equal(swarm.swarmId,coord);
  assert.deepEqual(swarm.ids,[coord,w1,w2,mon]);
  assert.equal(swarm.byId.get(coord).role,'coordinator');
  assert.equal(swarm.byId.get(coord).model,'Orchestrator (Neon)');
  assert.equal(swarm.byId.get(w1).role,'worker');
  assert.equal(swarm.byId.get(w1).model,'Gemini 4 Hydrogen (Orchestrator)');
  assert.equal(swarm.byId.get(w2).model,'Claude Sonnet 5.5 (High)');
  assert.equal(swarm.byId.get(w2).killed,true);
  assert.equal(swarm.byId.get(mon).role,'monitor');
  const serialized=JSON.stringify([...swarm.byId.values()]);
  assert.equal(serialized.includes('SECRET'),false);
  assert.equal(serialized.includes('PRIVATE'),false);
  assert.deepEqual(delegatedIds(coord,{trajectory:{steps:[]}},{},swarm),[w1,w2,mon]);
  // Unrelated conversation cannot adopt another swarm's members.json.
  assert.deepEqual(delegatedIds('99999999-9999-9999-9999-999999999999',{trajectory:{steps:[]}},{},swarm),[]);
});

test('readSwarmMembers rejects symlink escapes and oversized files',async t=>{
  const root=await mkdtemp(join(tmpdir(),'ag-swarm-sec-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const outside=join(root,'secret.json');await writeFile(outside,JSON.stringify({members:{a:{conversation_id:w1}}}));
  const swarmDir=join(root,coord,'.system_generated','swarm');await mkdir(swarmDir,{recursive:true});
  try{
    await symlink(outside,join(swarmDir,'members.json'));
    assert.equal(await readSwarmMembers(root,coord),null);
  }catch{}
  const hugeId=w2,hugeDir=join(root,hugeId,'.system_generated','swarm');await mkdir(hugeDir,{recursive:true});
  await writeFile(join(hugeDir,'members.json'),JSON.stringify({members:{a:{conversation_id:w1,pad:'x'.repeat(600000)}}}));
  assert.equal(await readSwarmMembers(root,hugeId),null);
});

test('classifyAgentRole and agentDescriptor separate coordinator, worker, monitor, and scheduled sidecars',()=>{
  assert.equal(classifyAgentRole({isRoot:true}),'coordinator');
  assert.equal(classifyAgentRole({isRoot:true,sourceMetadata:{sidecar:true}}),'sidecar');
  assert.equal(classifyAgentRole({isRoot:false,subagentSpec:{typeName:'worker',role:'Swarm Monitor'}}),'monitor');
  assert.equal(classifyAgentRole({isRoot:false,agentScript:{name:'research-worker'}}),'worker');
  assert.equal(cleanAgentLabel(coord),'');
  assert.equal(cleanAgentLabel('file:///tmp/x'),'');
  const summaries={[w1]:{trajectoryMetadata:{parentConversationId:coord,subagentSpec:{typeName:'worker',model:'MODEL_PLACEHOLDER_M669'},sourceMetadata:{rootConversationId:coord}}}};
  assert.deepEqual(delegatedIds(coord,{trajectory:{steps:[]}},summaries),[w1]);
  const desc=agentDescriptor(w1,{summaries});
  assert.equal(desc.role,'worker');
  assert.equal(desc.modelHint,'Gemini 4 Hydrogen (Orchestrator)');
});
