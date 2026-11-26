// Self-contained main-world UI. Shadow DOM isolates styling from the host app.
module.exports = function installAgPulseInlineWidget() {
  if (window.__agPulseInlineInstalled) return;
  const report=(stage,details={})=>window.agPulseHost?.report?.({stage,...details});
  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded',installAgPulseInlineWidget,{once:true});
    return;
  }
  if (!window.agPulseHost) return;
  const localGet=key=>{try{return localStorage.getItem(key);}catch{return null;}};
  const localSet=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  const language=window.__agPulseI18nFactory(localGet('ag-pulse-language'));
  const theme=window.__agPulseThemeFactory();
  const t=language.t;
  window.__agPulseInlineInstalled=true;
  report('boot',{hostFound:true});
  const ID='ag-pulse-status-bar',PANE_BOUNDARY='aside,[role="tabpanel"],[data-aux-pane-open],[data-pane-id]';
  // Host-specific discovery stays outside the shared widget. The IDE has no
  // /c/<id> URL, and must never inherit the desktop's conversation fallback.
  const surface=window.__agPulseSurface;
  const setMarkup=(element,markup)=>{if(surface?.setMarkup)surface.setMarkup(element,markup);else element.innerHTML=markup;};
  const instances=[];
  let layoutFrame=null,disposed=false;
  const HOVER_DELAY=250,WARM_WINDOW=350,LEAVE_DELAY=120,QUOTA_HOVER_COOLDOWN=4000;
  const densityMedia=matchMedia('(prefers-reduced-motion: reduce)');
  const densityEase='cubic-bezier(0.32,0.72,0,1)';
  const densitySpringEase='cubic-bezier(0.26,1.52,0.5,1)';
  const isPulseBar=e=>Boolean(e?.hasAttribute?.('data-ag-pulse-bar')||String(e?.id||'').startsWith(ID)||e?.closest?.('[data-ag-pulse-bar],[id^="'+ID+'"]'));
  const isOwnNode=target=>Boolean(target instanceof Node&&(instances.some(inst=>inst.node&&(target===inst.node||inst.node.contains(target)))||(target instanceof Element?target.closest?.('[data-ag-pulse-turn-footer]'):target.parentElement?.closest?.('[data-ag-pulse-turn-footer]'))));
  let guideReady=false,guideDismissed=false,guideOpened=false,guideSaving=false,guideError=false,usageGuideDismissed=false;
  let hostSettings=null;
  const speedStyle=language.connectSpeedStyle({
    initial:localGet('ag-pulse-speed-style'),cache:value=>localSet('ag-pulse-speed-style',value),
    write:input=>window.agPulseHost.setPreferences(input),changed:()=>{for(const inst of instances)inst.onSpeedStyleChanged();hostSettings?.sync();},
  });
  const usageScope=language.connectUsageScope({
    initial:localGet('ag-pulse-usage-scope'),cache:value=>localSet('ag-pulse-usage-scope',value),
    write:input=>window.agPulseHost.setPreferences(input),changed:()=>{for(const inst of instances)inst.onUsageScopeChanged();},
  });
  const quotaDisplay=language.connectQuotaDisplay({
    initial:localGet('ag-pulse-quota-display'),cache:value=>localSet('ag-pulse-quota-display',value),
    write:input=>window.agPulseHost.setPreferences(input),changed:()=>{for(const inst of instances)inst.onQuotaDisplayChanged();hostSettings?.sync();},
  });
  let compositionView=localGet('ag-pulse-composition-view')==='bar'?'bar':'list';
  let stepsDrawerOpen=false,pendingCompact=null,compactPollTimer=0,compactDispatching=false;
  const setCompositionView=next=>{
    const normalized=next==='bar'?'bar':'list';
    if(compositionView===normalized)return;
    compositionView=normalized;localSet('ag-pulse-composition-view',normalized);
    for(const inst of instances)inst.onCompositionViewChanged();
  };
  const hostI18n=typeof window.__agPulseHostI18nFactory==='function'?window.__agPulseHostI18nFactory({dictionary:window.__agPulseHostI18nDict||{},allowNested:window.__agPulseAllowNested===true,enabled:false}):null;
  let hostI18nOverridesLoaded=false,hostI18nEpoch=0;
  const hostUiLocalization=language.connectHostUiLocalization({
    initial:localGet('ag-pulse-host-ui-localization')==='true',cache:value=>localSet('ag-pulse-host-ui-localization',value?'true':'false'),
    write:input=>window.agPulseHost.setPreferences(input),
    changed:()=>{void syncHostUiLocalizationState();for(const inst of instances)inst.onHostUiLocalizationChanged();hostSettings?.sync();},
  });
  const storedInlineCacheHit=localGet('ag-pulse-inline-cache-hit');
  const inlineCacheHit=language.connectInlineCacheHit({
    initial:storedInlineCacheHit==='false'?false:storedInlineCacheHit==='true'?true:null,
    cache:value=>localSet('ag-pulse-inline-cache-hit',value?'true':'false'),
    write:input=>window.agPulseHost.setPreferences(input),
    changed:()=>{for(const inst of instances)inst.onInlineCacheHitChanged();hostSettings?.sync();},
  });
  const storedCacheChipMode=localGet('ag-pulse-cache-chip-mode');
  const cacheChipMode=language.connectCacheChipMode({
    initial:storedCacheChipMode||(storedInlineCacheHit==='false'?'tokens':null),
    cache:value=>{localSet('ag-pulse-cache-chip-mode',value);localSet('ag-pulse-inline-cache-hit',value==='tokens'?'false':'true');},
    write:input=>window.agPulseHost.setPreferences(input),
    changed:()=>{for(const inst of instances)inst.onCacheChipModeChanged();hostSettings?.sync();},
  });
  const readBarColorsCache=()=>{try{const raw=localGet('ag-pulse-bar-colors');return raw?JSON.parse(raw):null;}catch{return null;}};
  const barColorsPref=language.connectBarColors({
    initial:readBarColorsCache(),
    cache:value=>localSet('ag-pulse-bar-colors',JSON.stringify(value)),
    write:input=>window.agPulseHost.setPreferences(input),
    changed:()=>{for(const inst of instances)inst.onBarColorsChanged();hostSettings?.sync();},
  });
  const themeModePref=language.connectThemeMode({
    initial:localGet('ag-pulse-theme-mode'),
    cache:value=>localSet('ag-pulse-theme-mode',value),
    write:input=>window.agPulseHost.setPreferences(input),
    changed:()=>{for(const inst of instances)inst.onThemeModeChanged();hostSettings?.sync();},
  });
  const cacheHitTone=language.connectCacheHitTone({
    initial:localGet('ag-pulse-cache-hit-tone'),
    cache:value=>localSet('ag-pulse-cache-hit-tone',value),
    write:input=>window.agPulseHost.setPreferences(input),
    changed:()=>{for(const inst of instances)inst.onCacheHitToneChanged();hostSettings?.sync();},
  });
  const storedCacheHitTiers=localGet('ag-pulse-cache-hit-tiers');
  const cacheHitTiers=language.connectCacheHitTiers({
    initial:storedCacheHitTiers==='true'?true:storedCacheHitTiers==='false'?false:null,
    cache:value=>localSet('ag-pulse-cache-hit-tiers',value?'true':'false'),
    write:input=>window.agPulseHost.setPreferences(input),
    changed:()=>{for(const inst of instances)inst.onCacheHitTiersChanged();hostSettings?.sync();},
  });
  const readBarPrefsCache=()=>{try{const raw=localGet('ag-pulse-bar-prefs');return raw?JSON.parse(raw):null;}catch{return null;}};
  const barPrefs=language.connectBarPreferences({
    initial:readBarPrefsCache(),cache:value=>localSet('ag-pulse-bar-prefs',JSON.stringify(value)),
    write:input=>window.agPulseHost.setPreferences(input),changed:()=>{for(const inst of instances)inst.onBarPrefsChanged();hostSettings?.sync();},
  });
  const stripMode=language.connectStripMode({
    initial:localGet('ag-pulse-strip-mode'),cache:value=>localSet('ag-pulse-strip-mode',value),
    write:input=>window.agPulseHost.setPreferences(input),changed:()=>{for(const inst of instances)inst.onStripModeChanged();hostSettings?.sync();},
  });
  const barPlacement=language.connectBarPlacement({
    initial:localGet('ag-pulse-bar-placement'),cache:value=>localSet('ag-pulse-bar-placement',value),
    write:input=>window.agPulseHost.setPreferences(input),changed:()=>{for(const inst of instances)inst.onBarPlacementChanged();hostSettings?.sync();},
  });
  const storedTurnFooter=localGet('ag-pulse-turn-footer');
  const turnFooter=language.connectTurnFooter({
    initial:storedTurnFooter==='false'?false:storedTurnFooter==='true'?true:null,
    cache:value=>localSet('ag-pulse-turn-footer',value?'true':'false'),
    write:input=>window.agPulseHost.setPreferences(input),changed:()=>{for(const inst of instances)inst.onTurnFooterChanged?.();hostSettings?.sync();},
  });
  async function syncHostUiLocalizationState(){
    if(disposed||!hostI18n)return;
    const epoch=++hostI18nEpoch;
    if(!hostUiLocalization.enabled){hostI18nOverridesLoaded=false;hostI18n.setEnabled(false);return;}
    if(!hostI18nOverridesLoaded&&typeof window.agPulseHost?.getHostI18nOverrides==='function'){
      hostI18nOverridesLoaded=true;
      try{
        const res=await window.agPulseHost.getHostI18nOverrides();
        if(disposed||epoch!==hostI18nEpoch||!hostUiLocalization.enabled)return;
        if(res&&typeof res==='object'&&res.overrides)hostI18n.setOverrides(res.overrides);
      }catch{hostI18nOverridesLoaded=false;}
    }
    if(!disposed&&epoch===hostI18nEpoch&&hostUiLocalization.enabled)hostI18n.setEnabled(true);
  }
  if(hostUiLocalization.enabled)void syncHostUiLocalizationState();
  function syncGuide(value){speedStyle.sync(value);usageScope.sync(value);quotaDisplay.sync(value);hostUiLocalization.sync(value);inlineCacheHit.sync(value);cacheChipMode.sync(value);barColorsPref.sync(value);themeModePref.sync(value);cacheHitTone.sync(value);cacheHitTiers.sync(value);barPrefs.sync(value);stripMode.sync(value);barPlacement.sync(value);turnFooter.sync(value);if(value?.languageGuideDismissed===true)guideDismissed=true;if(value?.usageGuideDismissed===true){usageGuideDismissed=true;for(const inst of instances)inst.syncUsageGuide();}hostSettings?.sync();}
  window.__agPulseOnPreferences=value=>{if(!disposed&&value&&!value.error){syncGuide(value);preferences.sync(value);hostSettings?.sync();}};
  const preferences=language.connectPreferences({
    read:async()=>{const value=await window.agPulseHost.getPreferences();syncGuide(value);return value;},
    write:async input=>{const value=await window.agPulseHost.setPreferences(input);syncGuide(value);return value;},
    cache:value=>localSet('ag-pulse-language',value),changed:()=>{for(const inst of instances)inst.onLocaleChanged();hostSettings?.sync();},
  });
  hostSettings=typeof window.__agPulseHostSettingsFactory==='function'?window.__agPulseHostSettingsFactory({
    language,theme,preferences,barPrefs,barColorsPref,themeModePref,cacheHitTone,cacheHitTiers,inlineCacheHit,cacheChipMode,quotaDisplay,speedStyle,hostUiLocalization,stripMode,barPlacement,turnFooter,
    version:typeof window.__agPulseVersion==='string'?window.__agPulseVersion:'',
    allowNested:window.__agPulseAllowNested===true,
  }):null;
  void preferences.ready.then(()=>{if(disposed)return;guideReady=!preferences.error;hostSettings?.sync();scheduleLayout();});
  const icon=(name)=>({cache:'<ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 2 10 2 10 0V4M3 8c0 2 10 2 10 0"/>',five:'<circle cx="8" cy="8" r="5.6"/><path d="M8 4.7v3.6l2.3 1.4"/>',week:'<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M5 2v3m6-3v3M3 7h10"/>'}[name]);
  const svg=name=>`<svg viewBox="0 0 16 16" aria-hidden="true">${name==='context'?'<circle cx="8" cy="8" r="5.6"/><path d="M8 2.4V8l4.8 2.8"/>':icon(name)}</svg>`;
  const SVG_NS='http://www.w3.org/2000/svg';
  const svgEl=(tag,attrs={},children=[])=>{
    const el=document.createElementNS(SVG_NS,tag);
    for(const [k,v]of Object.entries(attrs))if(v!==null&&v!==undefined)el.setAttribute(k,String(v));
    for(const child of children)if(child)el.append(child);
    return el;
  };
  const CAT_SCALE=30/34,CAT_GROUND=18;
  const CAT_EYE=['hk','kk','kk'],CAT_BLINK=['kk'],CAT_SLEEP_EYE=['kkk'],CAT_NOSE=['ii'],CAT_BLUSH=['ii'];
  const CAT_STAMP_INK={k:'eye',h:'hl',i:'pink'};
  const CAT_IDLE_POSES=['upright','blink','tilting','tilted','tiltedBlink'];
  const CAT_SPARKLE=[[0,-1],[-1,0],[1,0],[0,1]];
  const CAT_BADGE=['.o........o.','o#o......o#o','oi#oooooo#io','o##########o','o##########o','o#####ii###o','o###wwww###o','.o########o.','..oooooooo..'];
  const CAT_BADGE_INK={o:'outline','#':'body',i:'pink',w:'light'};
  let cachedCatFrames=null;
  function getCatFrames(){
    if(cachedCatFrames)return cachedCatFrames;
    const E=(cx,cy,rx,ry,c,opts={})=>({t:'e',cx,cy,rx,ry,c,rot:0,...opts});
    const P=(pts,c)=>({t:'p',pts,c});
    const L=(a,b,w,c,opts={})=>({t:'l',a,b,w,c,...opts});
    const B=(a,b,over=false)=>({t:'b',a,b,c:'whisker',over});
    const S=(x,y,rows)=>({t:'s',x,y,rows});
    const bezier=(p0,p1,p2,p3,u1)=>{const u=1-u1,at=k=>u*u*u*p0[k]+3*u*u*u1*p1[k]+3*u*u1*u1*p2[k]+u1*u1*u1*p3[k];return [at(0),at(1)];};
    const tail=(p0,p1,p2,p3,w,c,n=18)=>Array.from({length:n},(_,i)=>L(bezier(p0,p1,p2,p3,i/n),bezier(p0,p1,p2,p3,(i+1)/n),w*(1-(0.3*i)/n),i/n>0.74?'tip':c));
    const shrink=(pts,f,dy)=>{const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cy=pts.reduce((s,p)=>s+p[1],0)/pts.length;return pts.map(([x,y])=>[cx+(x-cx)*f,cy+(y-cy)*f+dy]);};
    const xform=(items,move,angle=0)=>items.map(it=>{
      if(it.t==='e'){const [cx,cy]=move([it.cx,it.cy]);return {...it,cx,cy,rot:it.rot+angle};}
      if(it.t==='p')return {...it,pts:it.pts.map(move)};
      if(it.t==='s'){const [x,y]=move([it.x,it.y]);return {...it,x,y};}
      return {...it,a:move(it.a),b:move(it.b)};
    });
    const translate=(items,dx)=>xform(items,([x,y])=>[x+dx,y]);
    const rotate=(items,angle,[px,py])=>{if(!angle)return items;const c=Math.cos(angle),s=Math.sin(angle);return xform(items,([x,y])=>[px+(x-px)*c-(y-py)*s,py+(x-px)*s+(y-py)*c],angle);};
    const face=(hy,eyes)=>{
      const earL=[[-8.8,hy-1.3],[-3.2,hy-5.4],[-8.4,hy-10.8]],earR=earL.map(([x,y])=>[-x,y]);
      const eye=eyes==='open'?CAT_EYE:eyes==='sleep'?CAT_SLEEP_EYE:CAT_BLINK;
      return {
        shapes:[P(earL,'body'),P(earR,'body'),P(shrink(earL,0.5,0.5),'pink'),P(shrink(earR,0.5,0.5),'pink'),E(0,hy,9.2,7.2,'body'),E(0,hy+3.8,4.3,2.8,'light',{over:true})],
        overlays:[S(-3.7,hy+0.6,eye),S(3.7,hy+0.6,eye),S(0,hy+2.9,CAT_NOSE),S(-6.2,hy+3.3,CAT_BLUSH),S(6.2,hy+3.3,CAT_BLUSH),B([-9.4,hy+3.2],[-13.4,hy+2.2]),B([-9.4,hy+4.4],[-13.4,hy+5.2]),B([9.4,hy+3.2],[13.4,hy+2.2]),B([9.4,hy+4.4],[13.4,hy+5.2])],
      };
    };
    const sitting=(tilt,eyes)=>{
      const head=face(-3.4,eyes);
      return {box:[-15,-16,16,18],shapes:[...tail([5,16.4],[12.5,17],[13.8,8],[10.6,3.4],2.7,'body'),E(-5.9,14.6,4.4,3.5,'body'),E(5.9,14.6,4.4,3.5,'body'),E(0,10.4,7.3,7.6,'body'),E(5.6,12.4,1.7,4.4,'shade',{over:true}),E(0,9.6,4,5.6,'light',{over:true}),E(-2.6,16.8,2.1,1.3,'light'),E(2.6,16.8,2.1,1.3,'light'),...rotate(head.shapes,tilt,[0,4])],overlays:rotate(head.overlays,tilt,[0,4])};
    };
    const sleeping=(breath,k)=>{
      const head=face(5.8-breath/k,'sleep');
      return {box:[-18,-16,17,18],shapes:[E(9.6,13.4,4.8,4.6+breath*0.3,'body'),E(2.5,13.2,10.5,5+breath*0.4,'body'),E(11.4,14,2,3.2,'shade',{over:true}),...tail([13,16.4],[14,18.6],[3,18.8],[-7,17.4],2.4,'shade'),...translate(head.shapes,-3.5)],overlays:translate(head.overlays,-3.5)};
    };
    const footPos=(phase,beta,stride,lift)=>{const p=((phase%1)+1)%1;if(p<beta)return [stride/2-(p/beta)*stride,0];const u=(p-beta)/(1-beta);return [-stride/2+u*stride,-lift*Math.sin(Math.PI*u)];};
    const side=(phase,run,k)=>{
      const tau=Math.PI*2,q=v=>Math.round(v*k)/k,flex=run?Math.cos(tau*phase):0;
      const hipX=q(-6-0.6*flex),shX=q(5+0.6*flex),air=run?Math.max(0,Math.sin(tau*(phase-0.05))):0;
      const bob=run?0:Math.cos(2*tau*phase)<-0.3?1/k:0,by=q((run?8.4:7)-air)+bob;
      const pitch=run?Math.sin(tau*phase):0,arch=run?Math.max(0,-flex):0,hipY=q(by+1.3*pitch),shY=q(by-1.3*pitch);
      const legs=run?[[false,false,0],[true,false,0.5],[false,true,0.1],[true,true,0.6]]:[[false,false,0],[true,false,0.25],[false,true,0.5],[true,true,0.75]];
      const beta=run?0.38:0.62,stride=run?10:6;
      const legShapes=([front,near,off])=>{
        const [fx,fy]=footPos(phase+off,beta,stride,run?3.4:front?3.6:1.8),x=front?shX:hipX;
        const joint=[x,(front?shY:hipY)+2],foot=[x+fx,17.3+fy];
        const bend=Math.max(0,17.3-joint[1]-Math.hypot(foot[0]-joint[0],foot[1]-joint[1]))*0.9+0.3;
        const knee=[(joint[0]+foot[0])/2+(front?bend:-bend),(joint[1]+foot[1])/2],c=near?'body':'shade';
        return [L(joint,knee,2.7,c),L(knee,foot,2.3,c,{edge:near}),E(foot[0]+0.4,foot[1],1.5,0.9,near?'light':'shade',{edge:near})];
      };
      const mid=(hipX+shX)/2,half=(shX-hipX)/2,backY=q((hipY+shY)/2-1.6*arch),sw=Math.sin(tau*phase),base=[hipX-3.2,hipY-1.2];
      const tailShapes=run?tail(base,[hipX-8,hipY-1.5],[hipX-12,hipY-3+sw],[hipX-15.5,hipY-5.5+sw],2.5,'body'):tail(base,[hipX-7.5,by-3],[hipX-8.5+sw*1.2,by-12],[hipX-4.8+sw*1.2,by-14],2.5,'body');
      const hx=q(shX+4.8+(run?1:0)),hy=q(shY-6.6+(run?1.8:0)),back=run?[-1.6,1.4]:[0,0];
      const earB=[[hx-5.6,hy-1.8],[hx-1.6,hy-4.6],[hx-4.8+back[0],hy-9.8+back[1]]],earF=[[hx+0.6,hy-4.8],[hx+5.2,hy-2.2],[hx+3.4+back[0],hy-9.6+back[1]]];
      return {
        box:[-26,-12,22,18],
        shapes:[...legs.filter(l=>!l[1]).flatMap(legShapes),...tailShapes,E(hipX-0.5,hipY+0.4,4,4,'body'),E(mid,backY,half+3.4-arch,3.9+0.6*arch,'body'),E(shX+0.8,shY+0.2,4,4.3,'body'),E(mid+1,backY+3+0.6*arch,half,1.3,'light',{over:true}),E(shX+2.6,shY+1.4,2.2,3,'light',{over:true}),...legs.filter(l=>l[1]).flatMap(legShapes),P(earB,'body'),P(earF,'body'),P(shrink(earB,0.5,0.5),'pink'),P(shrink(earF,0.5,0.5),'pink'),E(hx,hy,6.2,5.3,'body'),E(hx+1.7,hy+2.2,3.1,2,'light',{over:true})],
        overlays:[S(hx-1.2,hy-0.4,CAT_EYE),S(hx+3.3,hy-0.4,CAT_EYE),S(hx+2,hy+1.8,CAT_NOSE),S(hx-3.7,hy+1.8,CAT_BLUSH),B([hx+5.8,hy+1.6],[hx+10,hy+0.8]),B([hx+5.8,hy+2.6],[hx+10,hy+3.4]),...(run?[B([hx-6.8,hy-0.4],[hx-9.8,hy-1.8],true),B([hx-6.8,hy+0.6],[hx-10,hy-0.2],true)]:[B([hx-5.8,hy+1.6],[hx-9.6,hy+0.8]),B([hx-5.8,hy+2.6],[hx-9.6,hy+3.4])])],
      };
    };
    const hit=(s,x,y)=>{
      if(s.t==='e'){let dx=x-s.cx,dy=y-s.cy;if(s.rot){const c=Math.cos(-s.rot),n=Math.sin(-s.rot);[dx,dy]=[dx*c-dy*n,dx*n+dy*c];}return (dx/s.rx)**2+(dy/s.ry)**2<=1;}
      if(s.t==='p'){let inside=false;for(let i=0,j=s.pts.length-1;i<s.pts.length;j=i++){const [xi,yi]=s.pts[i],[xj,yj]=s.pts[j];if((yi>y)!==(yj>y)&&x<((xj-xi)*(y-yi))/(yj-yi)+xi)inside=!inside;}return inside;}
      const [ax,ay]=s.a,[bx,by]=s.b,vx=bx-ax,vy=by-ay,u=Math.max(0,Math.min(1,((x-ax)*vx+(y-ay)*vy)/(vx*vx+vy*vy||1)));
      return Math.hypot(x-ax-u*vx,y-ay-u*vy)<=s.w/2;
    };
    const raster=(scene,k)=>{
      const [x0,y0,x1,y1]=scene.box,i0=Math.floor(x0*k),j0=Math.floor(y0*k),w=Math.ceil(x1*k)-i0,h=Math.ceil(y1*k)-j0;
      const cells=new Array(w*h).fill(null),edges=new Array(w*h).fill(false);
      for(let j=0;j<h;j++)for(let i=0;i<w;i++){
        const x=(i0+i+0.5)/k,y=(j0+j+0.5)/k;let c=null,edge=false;
        for(const s of scene.shapes)if((!s.over||c)&&hit(s,x,y)){c=s.c;edge=!!s.edge;}
        cells[j*w+i]=c;edges[j*w+i]=edge;
      }
      const out=cells.slice();
      for(let j=0;j<h;j++)for(let i=0;i<w;i++){if(!edges[j*w+i])continue;for(const n of [i-1,i+1])if(n>=0&&n<w&&cells[j*w+n]&&!edges[j*w+n])out[j*w+n]='outline';}
      for(let j=0;j<h;j++)for(let i=0;i<w;i++){if(cells[j*w+i])continue;if([[1,0],[-1,0],[0,1],[0,-1]].some(([di,dj])=>{const ni=i+di,nj=j+dj;return ni>=0&&nj>=0&&ni<w&&nj<h&&cells[nj*w+ni];}))out[j*w+i]='outline';}
      const put=(ci,cj,c,onlyEmpty)=>{const i=ci-i0,j=cj-j0;if(i<0||j<0||i>=w||j>=h||(onlyEmpty&&cells[j*w+i]))return;out[j*w+i]=c;};
      for(const o of scene.overlays){
        if(o.t==='s'){const left=Math.round(o.x*k-o.rows[0].length/2),top=Math.round(o.y*k-o.rows.length/2);o.rows.forEach((row,r)=>[...row].forEach((ch,c)=>{if(ch!=='.')put(left+c,top+r,CAT_STAMP_INK[ch],false);}));continue;}
        let ax=Math.floor(o.a[0]*k),ay=Math.floor(o.a[1]*k);const bx=Math.floor(o.b[0]*k),by=Math.floor(o.b[1]*k);
        const dx=Math.abs(bx-ax),dy=-Math.abs(by-ay),sx=ax<bx?1:-1,sy=ay<by?1:-1;let err=dx+dy;
        for(;;){put(ax,ay,o.c,!o.over);if(ax===bx&&ay===by)break;const e2=2*err;if(e2>=dy){err+=dy;ax+=sx;}if(e2<=dx){err+=dx;ay+=sy;}}
      }
      return {i0,j0,w,h,cells:out};
    };
    const k=CAT_SCALE;
    cachedCatFrames={
      walk:Array.from({length:8},(_,i)=>raster(side(i/8,false,k),k)),
      gallop:Array.from({length:6},(_,i)=>raster(side(i/6,true,k),k)),
      idle:{upright:raster(sitting(0,'open'),k),blink:raster(sitting(0,'blink'),k),tilting:raster(sitting(-0.16,'open'),k),tilted:raster(sitting(-0.3,'open'),k),tiltedBlink:raster(sitting(-0.3,'blink'),k)},
      sleep:[raster(sleeping(0,k),k),raster(sleeping(1,k),k)],
    };
    return cachedCatFrames;
  }
  function catPathNodes(frame,x,y){
    const ground=Math.round(CAT_GROUND*CAT_SCALE),paths=new Map();
    for(let j=0;j<frame.h;j++)for(let i=0;i<frame.w;){
      const ink=frame.cells[j*frame.w+i];if(!ink){i++;continue;}
      let n=1;while(i+n<frame.w&&frame.cells[j*frame.w+i+n]===ink)n++;
      paths.set(ink,`${paths.get(ink)||''}M${x+frame.i0+i} ${y+frame.j0+j-ground}h${n}v1h${-n}z`);i+=n;
    }
    return [...paths].map(([ink,d])=>svgEl('path',{class:`dashboard-cat-${ink}`,d}));
  }
  function updateCatBadge(svgNode,mood){
    if(!svgNode||svgNode._renderKey===mood)return;
    svgNode._renderKey=mood;
    if(!svgNode._catRoot){
      const cells=CAT_BADGE.flatMap((row,y)=>[...row].flatMap((ink,x)=>ink==='.'?[]:[{x:x+2,y:y+1,ink}]));
      const groups=Object.entries(CAT_BADGE_INK).map(([ink,name])=>svgEl('g',{class:`dashboard-cat-${name}`},cells.filter(c=>c.ink===ink).map(c=>svgEl('rect',{x:c.x,y:c.y,width:1,height:1}))));
      const eyes=svgEl('g',{class:'dashboard-cat-eye dashboard-cat-badge-eyes'},[svgEl('rect',{x:5,y:5,width:1,height:2}),svgEl('rect',{x:10,y:5,width:1,height:2})]);
      const g=svgEl('g',{class:`dashboard-cat cat-mood-${mood}`},[...groups,eyes]);
      svgNode._catRoot=g;svgNode.replaceChildren(g);return;
    }
    svgNode._catRoot.setAttribute('class',`dashboard-cat cat-mood-${mood}`);
  }
  function updateSpeedTrail(svgNode,samples,mood,stride){
    if(!svgNode)return;
    const strideCss=`${stride.toFixed(2)}s`,key=`${mood}|${strideCss}|${samples.join(',')}`;
    if(svgNode._renderKey===key)return;
    svgNode._renderKey=key;
    svgNode.style.setProperty('--clawd-stride',strideCss);
    const W=140,H=54,TOP=22,END=W-18,snap=v=>Math.round(v/2)*2;
    let line='',start=0,peakY=null,endX=END-4,endY=H-2;
    if(samples.length){
      const max=Math.max(...samples)*1.04,min=Math.min(...samples)*0.82,slots=Math.max(samples.length,12),last=samples.length-1;
      const x=idx=>snap(END-((last-idx)*END)/(slots-1)),y=val=>snap(TOP+(H-TOP-3)*(1-(val-min)/(max-min||1)));
      start=Math.max(0,snap(x(0)-END/(slots-1)));
      line=`M${start} ${y(samples[0])}`;
      samples.forEach((v,idx)=>{if(idx)line+=`H${x(idx)}V${y(v)}`;});
      endY=y(samples[last]);line+=`H${W-4}`;
      if(samples.length>1)peakY=y(Math.max(...samples));
    }
    const defs=svgEl('defs',{},[svgEl('linearGradient',{id:'ag-pulse-prism',x1:0,x2:1,y1:0,y2:0},[
      svgEl('stop',{offset:'0',class:'speed-stop-start'}),svgEl('stop',{offset:'0.55',class:'speed-stop-mid'}),
      svgEl('stop',{offset:'1',class:'speed-stop-end'}),
    ])]);
    const catY=endY-1,frames=getCatFrames(),catChildren=[];
    if(mood==='dash'){
      catChildren.push(svgEl('g',{class:'dashboard-clawd-streaks'},[catY-15,catY-11,catY-7].map((sy,idx)=>{
        const ln=svgEl('line',{x1:endX-22,x2:endX-(22+[10,14,8][idx]),y1:sy,y2:sy});
        ln.style.animationDelay=`${-idx*0.15}s`;return ln;
      })));
    }
    if(mood==='sleep'){
      for(const idx of [0,1]){
        const sp=svgEl('g',{class:`dashboard-cat-sparkle cat-tone-${idx?'pink':'cyan'}`},[
          ...CAT_SPARKLE.map(([dx,dy])=>svgEl('rect',{x:endX+7+dx,y:catY-20+dy,width:1,height:1})),
          svgEl('rect',{class:'dashboard-cat-sparkle-core',x:endX+7,y:catY-20,width:1,height:1}),
        ]);
        sp.style.animationDelay=`${-idx*1.3}s`;catChildren.push(sp);
      }
    }
    if(mood==='idle'){
      for(const pose of CAT_IDLE_POSES)catChildren.push(svgEl('g',{class:`dashboard-cat-frame cat-pose-${pose}`},catPathNodes(frames.idle[pose],endX,catY)));
    }else{
      const gait=mood==='sleep'?frames.sleep:mood==='dash'?frames.gallop:frames.walk;
      gait.forEach((f,idx)=>{
        const g=svgEl('g',{class:`dashboard-cat-frame${idx===0?' cat-first':''}`},catPathNodes(f,endX,catY));
        g.style.animationDelay=`calc(var(--cat-cycle) * ${(idx/gait.length-1).toFixed(4)})`;catChildren.push(g);
      });
    }
    svgNode.replaceChildren(
      defs,
      svgEl('line',{class:'dashboard-speed-base',x1:0,x2:W,y1:H-0.5,y2:H-0.5}),
      peakY!==null?svgEl('line',{class:'dashboard-speed-peak',x1:0,x2:W,y1:peakY,y2:peakY}):null,
      line?svgEl('path',{class:'dashboard-speed-area',d:`${line}V${H}H${start}Z`}):null,
      line?svgEl('path',{class:'dashboard-speed-line',d:line}):null,
      svgEl('g',{class:`dashboard-cat cat-mood-${mood}`},catChildren),
    );
  }
  // Minimal style: a neutral pulse glyph and a single-accent sparkline. Clearing
  // _catRoot makes the cat badge rebuild itself if the user switches back.
  function updateMinimalBadge(svgNode){
    if(!svgNode||svgNode._renderKey==='minimal')return;
    svgNode._renderKey='minimal';svgNode._catRoot=null;
    svgNode.replaceChildren(svgEl('path',{class:'speed-pulse-icon',d:'M1 5h3l2-4 3 8 2-4h4'}));
  }
  function updateMinimalTrail(svgNode,samples,live){
    if(!svgNode)return;
    const key=`minimal|${live?1:0}|${samples.join(',')}`;
    if(svgNode._renderKey===key)return;
    svgNode._renderKey=key;
    const W=140,H=54,shape=language.minimalTrail(samples,{width:W,height:H,top:6,bottom:2,right:4});
    svgNode.replaceChildren(
      svgEl('line',{class:'speed-min-base',x1:0,x2:W,y1:H-0.5,y2:H-0.5}),
      shape?svgEl('path',{class:'speed-min-area',d:shape.area}):null,
      shape?svgEl('path',{class:'speed-min-line',d:shape.line}):null,
      shape?svgEl('circle',{class:`speed-min-dot${live?' is-live':''}`,cx:shape.end[0],cy:shape.end[1],r:2.6}):null,
    );
  }
  const pct=n=>typeof n==='number'&&Number.isFinite(n)?`${(n*100).toFixed(1)}%`:'—';
  const rate=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:1,minimumFractionDigits:1}):'—';
  const count=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US'):'—';
  const smallCount=n=>typeof n==='number'&&Number.isFinite(n)?(Math.abs(n)<10000?String(n):n.toLocaleString('en-US')):'—';
  const compact=n=>{if(typeof n!=='number'||!Number.isFinite(n))return '—';for(const [base,suffix,nextBase,nextSuffix]of [[1e12,'T',0,''],[1e9,'B',1e12,'T'],[1e6,'M',1e9,'B'],[1e3,'K',1e6,'M']])if(n>=base){const scaled=n/base,rounded=Number(scaled.toFixed(1));return nextBase&&rounded*base>=nextBase?`1${nextSuffix}`:`${rounded}${suffix}`;}return String(n);};
  const tokUnit=n=>n===1?'tok':'toks';
  const compactDetail=n=>{if(typeof n!=='number'||!Number.isFinite(n))return '—';for(const [base,suffix,nextBase,nextSuffix]of [[1e12,'T',0,''],[1e9,'B',1e12,'T'],[1e6,'M',1e9,'B'],[1e3,'K',1e6,'M']])if(n>=base){const scaled=n/base,rounded=Number(scaled.toFixed(scaled<10?2:1));return nextBase&&rounded*base>=nextBase?`1${nextSuffix}`:`${rounded}${suffix}`;}return String(n);};
  const seconds=language.elapsed;
  const timer=(at,compact=false)=>language.countdown(at,Date.now(),compact);
  const date=language.resetDate;
  const label=language.quotaGroupLabel;
  const attribute=(element,name,value)=>{if(value===null){if(element.hasAttribute(name))element.removeAttribute(name);}else if(element.getAttribute(name)!==String(value))element.setAttribute(name,String(value));};
  const styleCache=new WeakMap();
  const style=(element,name,value)=>{if(!element)return;let map=styleCache.get(element);if(!map){map=new Map();styleCache.set(element,map);}if(map.get(name)===value)return;map.set(name,value);if(element.style.getPropertyValue(name)!==value)element.style.setProperty(name,value);};
  const hidden=(element,value)=>{if(element.hidden!==value)element.hidden=value;};
  const GUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const visibleHostElement=element=>element.isConnected&&!element.closest('[hidden],[inert]')&&element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden';
  const sidebarOwners=new WeakMap();
  const cleanModelText=v=>String(v||'').replace(/[\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
  function badgeTextRects(badge){
    if(!badge?.isConnected)return [];
    const walker=document.createTreeWalker(badge,NodeFilter.SHOW_TEXT),range=document.createRange(),rects=[];
    for(let textNode=walker.nextNode();textNode;textNode=walker.nextNode()){
      if(!textNode.textContent.trim()||textNode.parentElement?.closest('svg,[hidden],[inert]')||getComputedStyle(textNode.parentElement).visibility==='hidden')continue;
      range.selectNodeContents(textNode);rects.push(...range.getClientRects());
    }
    return rects.filter(r=>r.width>0&&r.height>0);
  }
  function captureNative(found){
    const branch=found.branch,r=branch.getBoundingClientRect();
    const baseline={height:r.height,icons:Array.from(branch.querySelectorAll('svg')).map(ic=>({icon:ic,width:ic.getBoundingClientRect().width})),reserve:0};
    if(found.kind==='ide')baseline.reserve=surface.nativeReserve(found);
    if(found.kind==='subagent'){
      const badge=found.anchor,css=getComputedStyle(badge);
      // Summed glyph fragments recover intrinsic text width even if the host
      // is already wrapping the badge when we first attach.
      const textWidth=badgeTextRects(badge).reduce((sum,rect)=>sum+rect.width,0);
      const iconWidth=badge.querySelector('svg')?.getBoundingClientRect().width||0;
      const natural=textWidth+Math.max(iconWidth,12)+(parseFloat(css.columnGap)||0)+(parseFloat(css.paddingLeft)||0)+(parseFloat(css.paddingRight)||0);
      baseline.reserve=Math.ceil(Math.max(badge.getBoundingClientRect().width,natural)+badge.getBoundingClientRect().left-r.left+(parseFloat(getComputedStyle(branch).paddingRight)||0));
    }
    return baseline;
  }
  function canMountFooter(found){
    const parent=found?.row?.parentElement;
    if(!parent||parent===document.body||parent===document.documentElement)return false;
    const css=getComputedStyle(parent);
    if(['flex','inline-flex'].includes(css.display)&&!css.flexDirection.startsWith('column'))return false;
    if(css.display==='grid'&&css.gridAutoFlow.startsWith('column'))return false;
    return true;
  }
  function composerLayout({row,editor,branch}){
    // Containment alone can join an app header and a distant message editor.
    // Accept only a horizontal, normal-flow action row local to that editor.
    const css=getComputedStyle(row);
    if(!['flex','inline-flex'].includes(css.display)||css.flexDirection!=='row'||['absolute','fixed'].includes(css.position)||row.closest('header,[role="banner"]'))return false;
    if(['absolute','fixed'].includes(getComputedStyle(branch).position))return false;
    const r=row.getBoundingClientRect(),e=editor.getBoundingClientRect(),p=row.parentElement.getBoundingClientRect();
    const pulseFooterH=Array.from(row.parentElement.children).filter(c=>isPulseBar(c)&&c.dataset.placement==='footer').reduce((s,c)=>s+c.getBoundingClientRect().height+8,0);
    const gap=Math.max(0,r.top-e.bottom,e.top-r.bottom);
    const overlap=Math.min(r.bottom,e.bottom)-Math.max(r.top,e.top);
    return r.width>0&&r.height>0&&e.width>0&&e.height>0&&gap<=48&&overlap<=2&&Math.min(r.right,e.right)>Math.max(r.left,e.left)&&(p.height-pulseFooterH)<=e.height+r.height+96;
  }
  const fiberCascadeId=(anchor,boundary)=>{
    if(!anchor)return null;
    const key=Object.keys(anchor).find(k=>k.startsWith('__reactFiber$'));
    if(!key)return null;
    const stopAt=boundary?.[key]||null;
    for(let fiber=anchor[key],hops=0;fiber&&fiber!==stopAt&&hops<40;fiber=fiber.return,hops++){
      if(fiber.stateNode instanceof Node&&boundary&&!boundary.contains(fiber.stateNode))break;
      const props=fiber.memoizedProps;
      if(props&&typeof props==='object'&&Object.hasOwn(props,'cascadeId')){
        const cid=props.cascadeId;
        return typeof cid==='string'&&GUID.test(cid)?cid.toLowerCase():null;
      }
    }
    return null;
  };
  function findComposers(){
    if(surface&&!surface.useSharedComposer)return surface.findComposers?surface.findComposers():[surface.findComposer(instances[0]?.composer)].filter(Boolean);
    const visible=visibleHostElement;
    const semanticEditors=Array.from(document.querySelectorAll('[role="combobox"][contenteditable="true"],[role="textbox"][contenteditable="true"]')).filter(visible);
    const editors=Array.from(new Set([...semanticEditors,...Array.from(document.querySelectorAll('[aria-label="Message input"],[aria-label="消息输入"],[aria-label="訊息輸入"]')).filter(visible)]));
    const stableModels=Array.from(document.querySelectorAll('[data-testid="model-selector-trigger"]')).filter(visible);
    const models=stableModels.length?stableModels:Array.from(document.querySelectorAll('button[role="combobox"][aria-haspopup],button[aria-label^="Select model"]')).filter(visible);
    const pairs=[];
    const ownsEditor=(element,editor)=>element.closest('[data-testid="agent-input-box"]')===editor.closest('[data-testid="agent-input-box"]');
    for(const model of models)for(const editor of editors){
      if(!ownsEditor(model,editor))continue;
      const box=editor.closest('[data-testid="agent-input-box"]');
      if(box){
        const owned=e=>e.closest('[data-testid="agent-input-box"]')===box;
        const activeEditors=Array.from(box.querySelectorAll('[contenteditable="true"]')).filter(e=>owned(e)&&visible(e));
        if(!activeEditors.includes(editor)||activeEditors.length!==1)continue;
      }
      let row=model.parentElement,distance=1;
      // The toolbar branch and editable branch meet at their nearest common
      // composer ancestor. Action-button labels and generation state are irrelevant.
      while(row?.parentElement&&!row.parentElement.contains(editor)&&row.parentElement!==document.body&&row.parentElement!==document.documentElement){row=row.parentElement;distance++;}
      if(!row||row===document.body||row.contains(editor)||!row.parentElement?.contains(editor)||[document.body,document.documentElement].includes(row.parentElement))continue;
      for(let element=editor;element&&element!==row.parentElement;element=element.parentElement)distance++;
      let branch=model;while(branch.parentElement!==row)branch=branch.parentElement;
      const pair={editor,model,row,branch,box,distance,kind:'main'};
      if(composerLayout(pair))pairs.push(pair);
    }
    // Subagents have a static identity badge instead of a model selector.
    // Use only a bounded, stable host input box with a semantic send control;
    // never use the auxiliary pane's arbitrary comboboxes as an anchor.
    for(const editor of editors){
      const box=editor.closest('[data-testid="agent-input-box"]');
      if(!box||!visible(box))continue;
      const owned=e=>e.closest('[data-testid="agent-input-box"]')===box;
      const activeEditors=Array.from(box.querySelectorAll('[contenteditable="true"]')).filter(e=>owned(e)&&visible(e));
      if(!activeEditors.includes(editor)||activeEditors.length!==1)continue;
      if(Array.from(box.querySelectorAll('[data-testid="model-selector-trigger"]')).some(e=>owned(e)&&visible(e)))continue;
      const controls=Array.from(box.querySelectorAll('[data-testid="send-button"],[data-tooltip-id*="send-button"],[data-testid="stop-button"],[data-testid="cancel-button"],button[aria-label]'))
        .filter(e=>owned(e)&&visible(e)&&(e.hasAttribute('data-testid')&&/^(send|stop|cancel)-button$/.test(e.dataset.testid)||e.getAttribute('data-tooltip-id')?.includes('send-button')||/^(?:cancel|stop|取消|停止)(?:\b|\s|生成|任务|响应|$)/i.test(e.getAttribute('aria-label')||'')));
      for(const send of controls){
        let row=send.parentElement,distance=1;
        while(row?.parentElement&&row.parentElement!==box&&!row.parentElement.contains(editor)){row=row.parentElement;distance++;}
        if(!row||row.contains(editor)||!row.parentElement?.contains(editor)||!box.contains(row))continue;
        const interactive='button,a,input,select,[contenteditable="true"],[role="button"],[role="combobox"],[aria-haspopup]';
        const candidates=Array.from(row.querySelectorAll('*')).filter(e=>owned(e)&&visible(e)&&!isPulseBar(e)&&e.querySelector('svg')&&badgeTextRects(e).length&&!e.contains(send)&&!send.contains(e)&&!e.matches(interactive)&&!e.closest(interactive)&&!e.querySelector(interactive));
        const anchors=candidates.filter(e=>!candidates.some(other=>other!==e&&e.contains(other)));
        if(anchors.length!==1)continue;
        const anchor=anchors[0];let branch=anchor;while(branch.parentElement!==row)branch=branch.parentElement;
        if(branch.contains(send))continue;
        for(let element=editor;element&&element!==row.parentElement;element=element.parentElement)distance++;
        const pair={editor,model:null,row,branch,anchor,box,distance,kind:'subagent'};
        if(composerLayout(pair)&&!pairs.some(p=>p.editor===editor&&p.row===row&&p.branch===branch))pairs.push(pair);
      }
    }
    const byOwner=new Map();
    for(const pair of pairs){
      const key=pair.box||pair.editor;
      let list=byOwner.get(key);if(!list){list=[];byOwner.set(key,list);}
      list.push(pair);
    }
    const uniquePairs=[];
    for(const list of byOwner.values()){
      list.sort((a,b)=>a.distance-b.distance);
      const minDist=list[0].distance,best=list.filter(p=>p.distance===minDist);
      if(best.length===1)uniquePairs.push(best[0]);
    }
    const boxed=uniquePairs.filter(p=>p.box);
    if(boxed.length)return boxed;
    if(!uniquePairs.length)return [];
    uniquePairs.sort((a,b)=>a.distance-b.distance);
    const focused=uniquePairs.filter(pair=>pair.editor===document.activeElement||(document.activeElement instanceof Node&&pair.editor.contains(document.activeElement)));
    if(focused.length===1)return [focused[0]];
    const retained=uniquePairs.filter(pair=>instances.some(inst=>!inst.parked&&inst.composer?.branch===pair.branch&&inst.composer?.editor===pair.editor));
    if(retained.length===1)return [retained[0]];
    // Equally plausible visible composers must not place the strip arbitrarily.
    const closest=uniquePairs.filter(pair=>pair.distance===uniquePairs[0].distance);
    if(closest.length===1)return [closest[0]];
    const fallback=closest.find(pair=>pair.editor===document.activeElement)||closest.find(pair=>instances.some(inst=>!inst.parked&&inst.composer?.branch===pair.branch&&inst.composer?.editor===pair.editor));
    return fallback?[fallback]:[];
  }
  function createStripInstance(){
  let node=null,root=null,data=null,pending=false,cardName=null,hoverTimer=null,openTimer=null,warmUntil=0,lastConversation=undefined,lastFetch=0,lastExpiredRefresh=0,resizeObserver=null,modelObserver=null,themeController=null,changingCards=false;
  const isWarm=()=>Boolean(cardName||Date.now()<warmUntil);
  let chosen=null,group=null,autoGroupId=null,lastModelSig=null,quotaSigCache=null,quotaObservedAt=0;
  let refreshRequest=null,manualRequest=null,hoverQuotaRequest=null,lastQuotaHoverAt=0,requestEpoch=0,scopeRequestEpoch=0;
  let composer=null,usageDashboard=null,updateMenu=null;
  let remoteSessionNote=null,languageRow=null,settingsDialog=null,settingsOpen=false,settingsTrigger=null,settingsHighlightTimer=0,saveNote=null,lastBarLayoutSig='',lastFooterHost='context',lastSettingsSig='',draggingChipId=null;
  let stickyRemoteHost=null;
  const detectRemoteHost=()=>{
    if(surface&&typeof surface.remoteHost==='function'){
      const explicit=surface.remoteHost(composer);
      if(explicit){stickyRemoteHost=explicit;return explicit;}
    }
    const candidates=document.querySelectorAll('button,[role="button"],[data-remote-host]');
    for(const el of candidates){
      if(el.closest('main,[role="main"],article,pre,code,[contenteditable="true"],.rounded-composer'))continue;
      const attrHost=el.getAttribute('data-remote-host');
      if(attrHost){
        const cleaned=attrHost.trim().replace(/^ssh:\s*/i,'').trim();
        if(cleaned&&/^[A-Za-z0-9._:@\[\]-]{1,120}$/.test(cleaned)){stickyRemoteHost=cleaned;return cleaned;}
      }
      const raw=(el.textContent||el.getAttribute('aria-label')||el.getAttribute('title')||'').replace(/\s+/g,' ').trim();
      const match=raw.match(/^SSH:\s*([A-Za-z0-9._:@\[\]-]{1,120})$/i);
      if(!match)continue;
      const inSidebar=Boolean(el.closest('aside,nav,[data-testid*="sidebar" i],[data-testid*="ssh" i]'));
      if(!inSidebar){
        const rect=el.getBoundingClientRect();
        if(!(rect.width>20&&rect.width<=420&&rect.height>=16&&rect.height<=64&&rect.left<400))continue;
      }
      stickyRemoteHost=match[1];
      return stickyRemoteHost;
    }
    return stickyRemoteHost;
  };
  let densityFrame=null,densityMotion=null,densityProbe=null;
  let isPrimary=false,parked=false,parkedKind=null,instDisposed=false;
  let emptyCompact=true,hasContextPercent=false,hydrated=false,seenEmptySession=false,suppressNextMotion=false,springNextExpand=false,swarmRosterFilter='active';
  const $=id=>root?.getElementById(id);
  const text=(id,value)=>{const e=$(id);if(e&&e.textContent!==String(value))e.textContent=String(value);};
  const isFooter=(found=composer)=>barPlacement.placement==='footer'&&canMountFooter(found);
  function applyPlacementStyle(footer){
    if(!node)return;
    node.dataset.placement=footer?'footer':'inline';
    node.style.cssText=footer
      ?'display:flex;align-items:center;justify-content:center;width:100%;min-width:0;max-width:100%;height:26px;margin:4px 0 0;position:relative;box-sizing:border-box;'
      :'display:flex;align-items:center;min-width:0;max-width:min(100%,var(--pulse-native-room,100%));height:28px;margin:0 3px;position:relative;';
  }
  const conversationId=()=>{
    if(surface&&!surface.useSharedComposer)return surface.conversationId(composer);
    const anchor=composer?.box||composer?.row;
    if(!anchor?.isConnected)return null;
    const readId=element=>{const id=element.getAttribute('data-cascade-id');return GUID.test(id||'')?id.toLowerCase():null;};
    // Full View encloses its input in the conversation owner. Auxiliary panes
    // (subagent tabs or Side Questions) put the owner on a sibling message
    // area. Search only siblings of this input's ancestor path, never other
    // panes or the transcript.
    let budget=96,otherComposer=false;
    const markersIn=(scope,branch)=>{
      const markers=[],stack=[];let evidence=false;
      if(scope.childElementCount-1>budget)return {markers,evidence,limited:true};
      for(const element of scope.children)if(element!==branch)stack.push({element,depth:0});
      while(stack.length){
        if(--budget<0)return {markers,evidence,limited:true};
        const {element,depth}=stack.pop();
        if(element.matches('[data-testid="subagent-tab-conversation"],[data-testid="side-question-conversation"]')){evidence=true;if(visibleHostElement(element))markers.push(element);continue;}
        if(isPulseBar(element)||element.closest('[hidden],[inert]'))continue;
        const css=getComputedStyle(element);if(css.display==='none'||css.visibility==='hidden')continue;
        if(element.matches('[data-testid="conversation-view"]')){
          const hasInner=Array.from(element.querySelectorAll('[data-testid="agent-input-box"]')).some(e=>!isPulseBar(e)&&visibleHostElement(e));
          if(hasInner)otherComposer=true;
          else{evidence=true;if(visibleHostElement(element)&&element.hasAttribute('data-cascade-id'))markers.push(element);}
          continue;
        }
        if(element.matches(PANE_BOUNDARY))continue;
        if(element.matches('[data-testid="agent-input-box"]')){if(visibleHostElement(element))otherComposer=true;continue;}
        if(element.matches('script,style,template,svg'))continue;
        if((element.childElementCount&&depth>=8)||element.childElementCount+stack.length>budget)return {markers,evidence,limited:true};
        for(const child of element.children)stack.push({element:child,depth:depth+1});
      }
      return {markers,evidence,limited:false};
    };
    const previous=sidebarOwners.get(anchor);
    if(previous&&!previous.contains(anchor))sidebarOwners.delete(anchor);
    let branch=null,hops=0;
    for(let scope=anchor;scope&&scope!==document.body&&scope!==document.documentElement;branch=scope,scope=scope.parentElement){
      if(++hops>32)return null;
      // The host may reuse the old sidebar content root for Full View.
      if(scope.matches('[data-testid="conversation-view"]'))return readId(scope);
      if(scope===anchor&&scope.hasAttribute('data-cascade-id'))return readId(scope);
      if(branch){
        const {markers,evidence,limited}=markersIn(scope,branch);
        if(limited&&(composer.kind==='subagent'||scope.closest(PANE_BOUNDARY)))return null;
        if(!limited){
          if(evidence){
            if(!otherComposer)sidebarOwners.set(anchor,scope);
            return !otherComposer&&markers.length===1?readId(markers[0]):null;
          }
          if(otherComposer)return null;
        }
      }
      if(sidebarOwners.get(anchor)===scope)return null;
      if(scope.hasAttribute('data-cascade-id'))return readId(scope);
      if(scope.matches(PANE_BOUNDARY))return fiberCascadeId(anchor,scope);
    }
    const id=location.pathname.match(/\/c\/([0-9a-f-]{36})/i)?.[1];
    return GUID.test(id||'')?id.toLowerCase():null;
  };
  function syncConversation(){
    const id=conversationId();
    if(id===lastConversation)return false;
    const prevId=lastConversation;
    lastConversation=id;requestEpoch++;pending=false;refreshRequest=null;lastFetch=0;
    stopDensityMotion();densityFrame=null;densityProbe=null;
    manualRequest=null;hoverQuotaRequest=null;lastQuotaHoverAt=0;quotaSigCache=null;setQuotaBusy(false);
    emptyCompact=true;hasContextPercent=false;springNextExpand=false;suppressNextMotion=false;swarmRosterFilter='active';
    if(!id){hydrated=true;seenEmptySession=true;}
    else if(prevId===null&&seenEmptySession){hydrated=false;}
    else{hydrated=false;seenEmptySession=false;}
    data={connection:'offline',groups:[],speed:null};group=null;hide();
    // Navigation has its own refresh budget. A request from the old composer
    // must neither block the new route nor reset its polling clock on arrival.
    queueMicrotask(()=>{if(!disposed&&!instDisposed)refresh();});return true;
  }
  function paintSpeed(samples,mood,stride,live){
    if(speedStyle.style==='cat'){updateCatBadge($('strip-cat-badge'),mood);updateCatBadge($('card-cat-badge'),'idle');updateSpeedTrail($('speed-trail'),samples,mood,stride);}
    else{updateMinimalBadge($('strip-cat-badge'));updateMinimalBadge($('card-cat-badge'));updateMinimalTrail($('speed-trail'),samples,live);}
  }
  function localize(){
    attribute(node,'lang',language.language);
    for(const e of root.querySelectorAll('[data-i18n]')){const value=t(e.dataset.i18n);if(e.textContent!==value)e.textContent=value;}
    for(const e of root.querySelectorAll('[data-i18n-aria]:not([data-card=cache]):not([data-card=quota])'))attribute(e,'aria-label',t(e.dataset.i18nAria));
    for(const e of root.querySelectorAll('[data-i18n-aria][title]:not([data-card])'))attribute(e,'title',t(e.dataset.i18nAria));
    for(const button of root.querySelectorAll('[data-language-choice]')){attribute(button,'aria-pressed',button.dataset.languageChoice===language.language);attribute(button,'data-save-failed',preferences.error);attribute(button,'title',preferences.error?t('languageSaveFailed'):(button.getAttribute('aria-label')||button.textContent));}
    text('language-save-note',preferences.error?t('languageSaveFailed'):hostUiLocalization.error?t('hostUiLocalizationSaveFailed'):themeModePref.error?t('themeModeSaveFailed'):barColorsPref.error?t('barColorsSaveFailed'):cacheHitTone.error?t('cacheHitToneSaveFailed'):cacheHitTiers.error?t('cacheHitTiersSaveFailed'):cacheChipMode.error?t('cacheChipModeSaveFailed'):barPrefs.error?t('barSaveFailed'):stripMode.error?t('stripModeSaveFailed'):barPlacement.error?t('barPlacementSaveFailed'):turnFooter.error?t('turnFooterSaveFailed'):'');
    text('settings-save-note',preferences.error?t('languageSaveFailed'):hostUiLocalization.error?t('hostUiLocalizationSaveFailed'):themeModePref.error?t('themeModeSaveFailed'):barColorsPref.error?t('barColorsSaveFailed'):cacheHitTone.error?t('cacheHitToneSaveFailed'):cacheHitTiers.error?t('cacheHitTiersSaveFailed'):cacheChipMode.error?t('cacheChipModeSaveFailed'):barPrefs.error?t('barSaveFailed'):stripMode.error?t('stripModeSaveFailed'):barPlacement.error?t('barPlacementSaveFailed'):turnFooter.error?t('turnFooterSaveFailed'):'');
    const toggleBtn=$('strip-toggle');
    if(toggleBtn){
      const minimal=stripMode.mode==='minimal',labelText=t(minimal?'stripExpand':'stripCollapse'),failed=stripMode.error;
      attribute(toggleBtn,'aria-expanded',String(!minimal));
      attribute(toggleBtn,'aria-label',labelText);
      attribute(toggleBtn,'title',failed?`${labelText} · ${t('stripModeSaveFailed')}`:labelText);
      attribute(toggleBtn,'data-save-failed',failed?'true':null);
    }
    for(const button of root.querySelectorAll('[data-strip-mode-choice]')){
      const value=button.dataset.stripModeChoice,name=t(value==='minimal'?'stripMinimal':'stripFull'),failed=stripMode.error&&stripMode.mode===value;
      attribute(button,'aria-label',name);attribute(button,'title',failed?`${name} · ${t('stripModeSaveFailed')}`:name);
      attribute(button,'aria-pressed',stripMode.mode===value);attribute(button,'data-save-failed',failed?'true':null);
    }
    for(const button of root.querySelectorAll('[data-bar-placement-choice]')){
      const value=button.dataset.barPlacementChoice,name=t(value==='footer'?'barPlacementFooter':'barPlacementInline'),failed=barPlacement.error&&barPlacement.placement===value;
      attribute(button,'aria-label',name);attribute(button,'title',failed?`${name} · ${t('barPlacementSaveFailed')}`:name);
      attribute(button,'aria-pressed',barPlacement.placement===value);attribute(button,'data-save-failed',failed?'true':null);
    }
    attribute(node,'data-strip-mode',stripMode.mode);
    for(const button of root.querySelectorAll('[data-speed-style-choice]')){const value=button.dataset.speedStyleChoice,name=t(value==='cat'?'styleCat':'styleMinimal'),failed=speedStyle.error&&speedStyle.style===value;attribute(button,'aria-label',name);attribute(button,'title',failed?`${name} · ${t('styleSaveFailed')}`:name);attribute(button,'aria-pressed',speedStyle.style===value);attribute(button,'data-save-failed',failed);}
    for(const button of root.querySelectorAll('[data-quota-display-choice]')){const value=button.dataset.quotaDisplayChoice,name=t(value==='both'?'quotaDisplayBoth':value==='auto'?'quotaDisplayAuto':value==='weekly'?'quotaDisplayWeekly':'quotaDisplayCompact'),failed=quotaDisplay.error&&quotaDisplay.value===value;attribute(button,'aria-label',name);attribute(button,'title',failed?`${name} · ${t('quotaDisplaySaveFailed')}`:name);attribute(button,'aria-pressed',quotaDisplay.value===value);attribute(button,'data-save-failed',failed);}
    for(const button of root.querySelectorAll('[data-composition-view]')){attribute(button,'aria-pressed',button.dataset.compositionView===compositionView);}
    const hostI18nHint=t('hostUiLocalizationHint');
    const hostLabelEl=$('host-i18n-label');
    if(hostLabelEl)attribute(hostLabelEl,'title',hostI18nHint);
    for(const button of root.querySelectorAll('[data-host-i18n-choice]')){const value=button.dataset.hostI18nChoice==='true',active=hostUiLocalization.enabled===value,failed=hostUiLocalization.error&&active,labelText=t(value?'hostUiLocalizationOn':'hostUiLocalizationOff');attribute(button,'aria-label',`${t('hostUiLocalization')}: ${labelText}`);attribute(button,'title',failed?`${hostI18nHint} · ${t('hostUiLocalizationSaveFailed')}`:hostI18nHint);attribute(button,'aria-pressed',active);attribute(button,'data-save-failed',failed);}
    for(const button of root.querySelectorAll('[data-cache-chip-mode]')){const value=button.dataset.cacheChipMode,active=cacheChipMode.value===value,failed=cacheChipMode.error&&active,labelText=t(value==='tokens'?'cacheChipModeTokens':value==='hit'?'cacheChipModeHit':'cacheChipModeBoth');attribute(button,'aria-label',`${t('cacheChipMode')}: ${labelText}`);attribute(button,'title',failed?`${labelText} · ${t('cacheChipModeSaveFailed')}`:labelText);attribute(button,'aria-pressed',active);attribute(button,'data-save-failed',failed);}
    for(const button of root.querySelectorAll('[data-cache-hit-tiers-choice]')){const value=button.dataset.cacheHitTiersChoice==='true',active=cacheHitTiers.enabled===value,failed=cacheHitTiers.error&&active,labelText=t(value?'cacheHitTiersAuto':'cacheHitTiersFixed');attribute(button,'aria-label',`${t('cacheHitTiersLabel')}: ${labelText}`);attribute(button,'title',failed?`${labelText} · ${t('cacheHitTiersSaveFailed')}`:(value?t('cacheHitTiersHint'):labelText));attribute(button,'aria-pressed',active);attribute(button,'data-save-failed',failed);}
    for(const button of root.querySelectorAll('[data-theme-mode-choice]')){const value=button.dataset.themeModeChoice,active=themeModePref.value===value,failed=themeModePref.error&&active;attribute(button,'aria-pressed',active);attribute(button,'data-save-failed',failed);attribute(button,'title',failed?t('themeModeSaveFailed'):null);}
    const curColors=barColorsPref.colors;
    for(const button of root.querySelectorAll('[data-bar-color-default]')){const slot=button.dataset.barColorDefault,active=!curColors[slot];attribute(button,'aria-pressed',active);attribute(button,'data-save-failed',barColorsPref.error);attribute(button,'title',barColorsPref.error?t('barColorsSaveFailed'):null);}
    for(const button of root.querySelectorAll('[data-bar-color-preset]')){const slot=button.dataset.barColorSlot,hex=button.dataset.barColorPreset,active=curColors[slot]===hex;attribute(button,'aria-pressed',active);attribute(button,'data-save-failed',barColorsPref.error&&active);}
    const zh=language.language==='zh-CN',tw=language.language==='zh-TW';
    text('usage-today-label',tw?'今日用量':(zh?'今日用量':'Today'));text('usage-month-label',tw?'本月用量':(zh?'本月用量':'This month'));
    text('usage-open-label',tw?'檢視用量統計':(zh?'查看用量统计':'View token usage'));updateMenu?.localize();
    updateGuide();
  }
  function stopDensityMotion(){
    const motion=densityMotion;densityMotion=null;
    if(!motion)return;
    for(const animation of motion.animations)animation.cancel();
    motion.stage.remove();delete node?.dataset.motion;delete node?.dataset.motionKind;
  }
  function densitySnapshot(previous){
    const pieces=new Map();
    for(const chip of root.querySelectorAll('.bar .chip'))for(const element of chip.children){
      if(!element.getClientRects().length)continue;
      const style=getComputedStyle(element);
      pieces.set(element,{rect:element.getBoundingClientRect(),opacity:1,font:style.font,color:style.color,icon:element.matches('svg,.context-ring')});
    }
    // Read interrupted copies before changing density. Reading them after the
    // final flex layout moves their parent would bake that shift into the new
    // start position and produce a visible jump on reversal.
    if(previous&&densityMotion)for(const [element,visual]of densityMotion.pieces){
      const piece=pieces.get(element)||densityMotion.sources.get(element);
      if(piece)pieces.set(element,{...piece,rect:visual.getBoundingClientRect(),opacity:Number(getComputedStyle(visual).opacity)});
    }
    return {pieces,rect:node.getBoundingClientRect(),model:composer.model,modelRect:previous?.model===composer.model?previous.modelRect:composer.model?.getBoundingClientRect(),row:composer.row};
  }
  function densityBounds(next){
    const footer=isFooter();
    const row=(footer?(next.row.parentElement||next.row):next.row).getBoundingClientRect(),target=next.rect;
    let left=Math.max(row.left,footer?0:(composer.anchor?.getBoundingClientRect().right||0)),right=Math.min(row.right,innerWidth);
    for(const control of document.querySelectorAll('button,[role="button"],a[href],input,select')){
      if(control===next.model||(next.model&&(next.model.contains(control)||control.contains(next.model))))continue;
      const r=control.getBoundingClientRect();
      if(r.width<=0||r.height<=0||Math.min(target.bottom,r.bottom)-Math.max(target.top,r.top)<=1)continue;
      if(control.closest('[hidden],[inert]')||getComputedStyle(control).visibility==='hidden')continue;
      if(!next.row.parentElement?.contains(control)){
        if(Math.min(right,r.right)-Math.max(left,r.left)<=0)continue;
        const x=(Math.max(left,r.left)+Math.min(right,r.right))/2,y=(Math.max(target.top,r.top)+Math.min(target.bottom,r.bottom))/2;
        const hit=document.elementFromPoint(x,y);
        if(!hit||(hit!==control&&!control.contains(hit)))continue;
      }
      if(r.right<=target.left+1)left=Math.max(left,r.right);
      else if(r.left>=target.right-1)right=Math.min(right,r.left);
      else return null;
    }
    return right-left>=target.width-2?{left,right}:null;
  }
  function clipDensityMotion(next){
    if(!densityMotion)return;
    const bounds=densityBounds(next);
    if(!bounds){stopDensityMotion();return;}
    // The ribbon follows its parent 1:1 while dragging. Keep its existing
    // compositor animation and clock; only crop to current safe host bounds.
    const stage=densityMotion.stage,r=stage.getBoundingClientRect(),pad=densityMotion.padTop||0;
    stage.style.clipPath=`inset(${pad?-pad:0}px ${Math.max(0,r.right-bounds.right)}px ${pad?-pad:0}px ${Math.max(0,bounds.left-r.left)}px)`;
  }
  function animateDensity(previous,next,{spring=false}={}){
    // A narrow composer gives its space straight back to native controls. Only
    // inert visual copies move; the real icons immediately have safe hit boxes.
    // Copies share a clipped ribbon with the model selector's reveal, never the
    // send/mic/add controls. Neither flex widths nor host styles are animated.
    const interrupted=densityMotion;
    const modelOpacity=next.model?getComputedStyle(next.model).opacity:'1';
    stopDensityMotion();
    if(!Element.prototype.animate)return;
    const bounds=densityBounds(next);if(!bounds)return;
    const {left,right}=bounds,target=next.rect;
    const reduce=densityMedia.matches,useSpring=spring&&!reduce;
    const duration=spring?(reduce?140:420):(reduce?120:240);
    const padTop=useSpring?2:0;
    const stage=document.createElement('div');stage.className='density-stage';stage.inert=true;stage.setAttribute('aria-hidden','true');
    stage.style.cssText=`left:${left-target.left}px;top:${-padTop}px;width:${right-left}px;height:${target.height+padTop*2}px`;
    root.append(stage);
    const motion={stage,padTop,animations:[],pieces:new Map(),sources:new Map([...previous.pieces,...next.pieces])};
    densityMotion=motion;node.dataset.motion='density';
    if(spring)node.dataset.motionKind='spring';
    const play=(element,frames,options={})=>{const animation=element.animate(frames,{duration,easing:useSpring?densitySpringEase:densityEase,...options});motion.animations.push(animation);return animation;};
    const chipOrder=['speed','cache','quota','context'];
    const chipStartX=new Map();
    if(useSpring){
      for(const [el,piece]of previous.pieces){
        if(!piece.icon)continue;
        const key=el.closest('[data-card]')?.dataset.card;
        if(key)chipStartX.set(key,Math.max(left,Math.min(right-piece.rect.width,piece.rect.left)));
      }
      if(previous.pieces.size&&next.pieces.size){
        const spanOf=map=>{let lo=Infinity,hi=-Infinity;for(const p of map.values()){lo=Math.min(lo,p.rect.left);hi=Math.max(hi,p.rect.right);}return Number.isFinite(lo)?[Math.max(left,lo-5),Math.min(right,hi+5)]:null;};
        const fromSpan=spanOf(previous.pieces),toSpan=spanOf(next.pieces);
        if(fromSpan&&toSpan){
          const fromW=Math.max(12,fromSpan[1]-fromSpan[0]),toW=Math.max(12,toSpan[1]-toSpan[0]);
          const pill=document.createElement('div');pill.className='density-pill';
          pill.style.cssText=`position:absolute;left:${toSpan[0]-left}px;top:${padTop}px;width:${toW}px;height:${target.height}px;border-radius:7px;background:color-mix(in srgb,var(--pulse-accent) 11%,var(--pulse-hover));pointer-events:none;transform-origin:left center`;
          stage.prepend(pill);
          play(pill,[{transform:`translateX(${fromSpan[0]-toSpan[0]}px) scaleX(${fromW/toW})`},{transform:'translateX(0px) scaleX(1)'}],{duration:430,fill:'both'});
          play(pill,[{opacity:0.9,offset:0},{opacity:0.75,offset:0.65},{opacity:0,offset:1}],{duration:460,easing:'ease-out',fill:'both'});
        }
      }
    }
    const maxHold=useSpring?495:duration;
    for(const element of new Set([...previous.pieces.keys(),...next.pieces.keys()])){
      const from=previous.pieces.get(element),to=next.pieces.get(element),piece=to||from;
      const visual=element.cloneNode(true),end=to?.rect||from.rect;
      for(const part of [visual,...visual.querySelectorAll('*')])for(const attribute of [...part.attributes])if(attribute.name==='id'||attribute.name.startsWith('data-')||attribute.name.startsWith('aria-'))part.removeAttribute(attribute.name);
      const endX=Math.max(left,Math.min(right-end.width,end.left)),endY=end.top-target.top+padTop;
      visual.classList.add('density-piece');visual.style.cssText+=`;position:absolute;left:${endX-left}px;top:${endY}px;width:${end.width}px;height:${end.height}px;font:${piece.font};color:${piece.color};margin:0;pointer-events:none;display:block`;
      stage.append(visual);motion.pieces.set(element,visual);
      if(useSpring){
        const cardKey=element.closest('[data-card]')?.dataset.card;
        const chipIdx=Math.max(0,chipOrder.indexOf(cardKey));
        if(from&&to){
          const startX=Math.max(left,Math.min(right-from.rect.width,from.rect.left));
          const dx=startX-endX,dy=from.rect.top-end.top;
          play(visual,[{transform:`translate(${dx}px,${dy}px) scale(0.9)`},{transform:'translate(0,0) scale(1)'}],{delay:chipIdx*22,duration:420,fill:'both'});
        }else if(to){
          const anchor=chipStartX.get(cardKey);
          const idealStart=anchor!==undefined?anchor+Math.max(0,end.left-anchor)*0.35:end.left-14;
          const clampedStart=Math.max(left,Math.min(right-end.width,idealStart));
          const labelDx=clampedStart-endX,delay=24+chipIdx*24;
          play(visual,[{transform:`translate(${labelDx}px,0) scale(0.86)`},{transform:'translate(0,0) scale(1)'}],{delay,duration:420,fill:'both'});
          play(visual,[{opacity:0},{opacity:1}],{delay,duration:220,easing:'ease-out',fill:'both'});
        }else{
          play(visual,[{opacity:from?.opacity??1},{opacity:0}],{duration:100,easing:'ease-out',fill:'both'});
        }
        if(to)play(element,[{opacity:0},{opacity:0}],{duration:maxHold,easing:'linear',fill:'both'});
        continue;
      }
      const start=from?.rect||end;
      const startX=Math.max(left,Math.min(right-start.width,start.left));
      const dx=reduce?0:startX-endX,dy=reduce?0:start.top-end.top;
      const startOpacity=from?.opacity??0,endOpacity=to?1:0;
      play(visual,[{transform:`translate(${dx}px,${dy}px)`,opacity:startOpacity},{transform:'translate(0,0)',opacity:endOpacity}],{fill:'both',...(piece.icon?{}:{duration:to?duration:80})});
      if(to)play(element,[{opacity:0},{opacity:0}],{fill:'both'});
    }
    // The host model name often goes from a caret to a full label as space is
    // returned. Let the outgoing labels leave before revealing that name.
    if(next.model&&previous.model===next.model&&(Math.abs(next.modelRect.width-previous.modelRect.width)>8||interrupted&&Number(modelOpacity)<.999)){
      play(next.model,[{opacity:interrupted?modelOpacity:0},{opacity:1}],{delay:reduce||interrupted?0:100,duration:reduce?120:interrupted?240:140,easing:densityEase,fill:'backwards'});
    }
    const finish=play(stage,[{opacity:1},{opacity:1}],{duration:maxHold,easing:'linear'});
    finish.onfinish=()=>{if(densityMotion===motion){stopDensityMotion();position();}};
  }
  function fit(){
    if(!node?.isConnected||parked||!composer)return;
    // A modal owns input while open. Composer collision scans behind its
    // backdrop cannot improve its layout and can hide its hosting strip.
    if(usageDashboard?.isOpen){stopDensityMotion();return;}
    reserveNativeSpace();
    const bar=root.querySelector('.bar'),oldDensity=node.dataset.density,oldReady=node.dataset.layout==='ready';
    let previous=densityFrame;
    if(['compact','narrow','context-only'].some(c=>node.classList.contains(c)))node.classList.remove('compact','narrow','context-only');
    // Flex shrink alone does not constrain nowrap children or protect controls
    // positioned outside the flex flow (e.g. Agent Manager window buttons).
    const fits=()=>{
      const rect=node.getBoundingClientRect(),row=(isFooter()?(composer.row.parentElement||composer.row):composer.row).getBoundingClientRect();
      const intersects=other=>Math.min(rect.right,other.right)-Math.max(rect.left,other.left)>1&&Math.min(rect.bottom,other.bottom)-Math.max(rect.top,other.top)>1;
      const barOverflow=!node.classList.contains('icons-only')&&!node.classList.contains('minimal-icon')&&(()=>{const items=Array.from(bar.children).filter(c=>!c.hidden&&getComputedStyle(c).display!=='none');if(!items.length)return false;const br=bar.getBoundingClientRect(),last=items[items.length-1].getBoundingClientRect();return last.right>br.right+1.5;})();
      if(barOverflow||bar.scrollWidth>bar.clientWidth+2||rect.width<=0||rect.left< -1||rect.right>innerWidth+1||rect.top< -1||rect.bottom>innerHeight+1||rect.left<row.left-1||rect.right>row.right+1)return false;
      if(!nativeComfortable())return false;
      if(composer.kind==='subagent'&&intersects(composer.anchor.getBoundingClientRect()))return false;
      for(const control of document.querySelectorAll('button,[role="button"],a[href],input,select,[contenteditable="true"]')){
        const other=control.getBoundingClientRect();
        if(other.width<=0||other.height<=0||!intersects(other))continue;
        if(control.closest('[hidden],[inert]')||getComputedStyle(control).visibility==='hidden')continue;
        // Scrolling messages can put clipped/covered links underneath the
        // fixed composer. Their rectangles alone are not a visible collision.
        // Always reserve local actions; other controls must actually paint at
        // the intersection (e.g. a floating jump-to-bottom button).
        if(composer.row.parentElement?.contains(control))return false;
        const left=Math.max(rect.left,other.left),right=Math.min(rect.right,other.right),top=Math.max(rect.top,other.top),bottom=Math.min(rect.bottom,other.bottom);
        for(const [x,y]of [[(left+right)/2,(top+bottom)/2],[left+.5,top+.5],[right-.5,top+.5],[left+.5,bottom-.5],[right-.5,bottom-.5]]){
          const hit=document.elementFromPoint(x,y);
          if(hit&&(hit===control||control.contains(hit)))return false;
        }
      }
      return true;
    };
    let safe=false,snapshotTaken=false,nextDensity='full';
    const captureBeforeMutate=()=>{if(oldReady&&!snapshotTaken){previous=densitySnapshot(previous);snapshotTaken=true;}};
    const DENSITY_CLASSES=['icons-only','compact-text','snug-rounds','mini-rounds','tight-text','trim-hit','dense-text','minimal','minimal-tight','minimal-icon','minimal-empty'];
    const DENSITY_SET=new Set(DENSITY_CLASSES);
    const hasExactClasses=wanted=>DENSITY_CLASSES.every(cls=>node.classList.contains(cls)===wanted.includes(cls));
    const applyDensityClasses=wanted=>{
      if(hasExactClasses(wanted))return;
      captureBeforeMutate();
      const kept=Array.from(node.classList).filter(cls=>!DENSITY_SET.has(cls));
      node.className=[...kept,...wanted].join(' ');
    };
    const rowWidth=(isFooter()?(composer.row.parentElement||composer.row):composer.row).getBoundingClientRect().width;
    const probeKey=()=>{const s=getComputedStyle(node);return node.style.cssText.replace(/--pulse-native-room:[^;]+;?/g,'')+'|'+s.fontFamily+'|'+s.fontSize+'|'+language.language+'|'+stripMode.mode+'|'+(isFooter()?'footer':'inline')+'|'+(hasContextPercent?'1':'0')+'|'+lastConversation+'|'+barPrefs.order.join(',')+'|'+barPrefs.hidden.join(',')+'|'+barPrefs.contextChipMode+'|'+quotaDisplay.value+'|'+cacheChipMode.value+'|'+bar.textContent+'|'+$('dot').className+'|'+getComputedStyle(composer.row).gap+'|'+(composerModelSignature()||'')+'|'+Array.from(composer.row.querySelectorAll('button,[role="button"],a[href],input,select')).filter(c=>c!==composer.model&&!(composer.model&&c.contains(composer.model))).map(c=>Math.round(c.getBoundingClientRect().width)).join(',');};
    if(stripMode.mode==='minimal'){
      const tiers=[
        {name:'minimal',classes:['minimal','icons-only']},
        {name:'minimal-icon',classes:['minimal','minimal-icon']},
      ];
      const curIdx=tiers.findIndex(item=>item.name===oldDensity);
      const key=curIdx>0?probeKey():null;
      const canRecover=curIdx>0&&(!densityProbe||key!==densityProbe.key||rowWidth>=densityProbe.width+12);
      const startIdx=curIdx<=0||canRecover?0:curIdx;
      nextDensity=tiers[tiers.length-1].name;
      for(let i=startIdx;i<tiers.length;i++){
        applyDensityClasses(tiers[i].classes);
        safe=fits();
        if(safe){
          nextDensity=tiers[i].name;
          if(i===0)densityProbe=null;
          else if(startIdx===0||!densityProbe||key!==densityProbe.key)densityProbe={key:key??probeKey(),width:rowWidth};
          break;
        }
      }
      if(!safe)densityProbe={key:key??probeKey(),width:rowWidth};
    }else{
      if(emptyCompact){
        applyDensityClasses(['icons-only']);
        densityProbe=null;safe=fits();
        nextDensity='icons';
      }else{
        const tiers=[
          {name:'full',classes:[]},
          {name:'compact-text',classes:['compact-text']},
          {name:'snug-rounds',classes:['compact-text','snug-rounds']},
          {name:'mini-rounds',classes:['compact-text','snug-rounds','mini-rounds']},
          {name:'tight-text',classes:['compact-text','snug-rounds','mini-rounds','tight-text']},
          {name:'trim-hit',classes:['compact-text','snug-rounds','mini-rounds','tight-text','trim-hit']},
          {name:'dense-text',classes:['compact-text','snug-rounds','mini-rounds','tight-text','trim-hit','dense-text']},
          {name:'icons',classes:['icons-only']},
        ];
        const curIdx=tiers.findIndex(item=>item.name===oldDensity);
        const key=curIdx>0?probeKey():null;
        const canRecover=curIdx>0&&(!densityProbe||key!==densityProbe.key||rowWidth>=densityProbe.width+12);
        const startIdx=curIdx<=0||canRecover?0:curIdx;
        nextDensity=tiers[tiers.length-1].name;
        for(let i=startIdx;i<tiers.length;i++){
          applyDensityClasses(tiers[i].classes);
          safe=fits();
          if(safe){
            nextDensity=tiers[i].name;
            if(i===0)densityProbe=null;
            else if(startIdx===0||!densityProbe||key!==densityProbe.key)densityProbe={key:key??probeKey(),width:rowWidth};
            break;
          }
        }
        if(!safe)densityProbe={key:key??probeKey(),width:rowWidth};
      }
    }
    node.dataset.density=nextDensity;
    const state=safe?'ready':'blocked';
    if(node.dataset.layout!==state){node.dataset.layout=state;node.inert=!safe;if(!safe)hide();}
    const skipMotion=suppressNextMotion;suppressNextMotion=false;
    const useSpring=stripMode.mode==='full'&&springNextExpand&&node.dataset.density==='full';
    if(node.dataset.density==='full'||stripMode.mode==='minimal'||!safe)springNextExpand=false;
    const changed=safe&&oldReady&&previous?.row===composer.row&&oldDensity!==node.dataset.density;
    const isIconDensity=d=>d==='icons'||d==='minimal'||d==='minimal-icon';
    const animateChange=changed&&!skipMotion&&(useSpring||isIconDensity(oldDensity)!==isIconDensity(node.dataset.density));
    if(oldDensity&&oldDensity!==node.dataset.density&&(animateChange||isIconDensity(oldDensity)!==isIconDensity(node.dataset.density))){ignoreHoverUntil=Date.now()+300;if(cardName){clearTimeout(openTimer);openTimer=null;}}
    const next=animateChange?densitySnapshot():{rect:node.getBoundingClientRect(),model:composer.model,modelRect:composer.model?.getBoundingClientRect(),row:composer.row};
    if(animateChange)animateDensity(previous,next,{spring:useSpring});
    else if(!safe||previous?.row!==composer.row||previous?.model!==composer.model||changed)stopDensityMotion();
    else if(densityMotion)clipDensityMotion(next);
    densityFrame=next;
    updateGuide();
  }
  function modelTruncationDeficit(branch,trigger){
    if(!branch?.isConnected)return 0;
    let deficit=0;
    const visit=el=>{
      if(!el||el.nodeType!==1||el.tagName==='SVG'||el.closest('svg,[hidden],[inert]'))return;
      const css=getComputedStyle(el);
      if(css.display==='none'||css.visibility==='hidden'||['absolute','fixed'].includes(css.position))return;
      if(el.getClientRects().length>0&&el.scrollWidth>el.clientWidth+1){
        deficit=Math.max(deficit,el.scrollWidth-el.clientWidth);
      }
      for(const child of el.children)visit(child);
    };
    visit(branch);
    if(trigger?.isConnected){
      const clipBoxes=[];
      for(let el=trigger;el&&el!==branch.parentElement;el=el.parentElement){
        const css=getComputedStyle(el);
        if(['hidden','clip','scroll','auto'].includes(css.overflowX))clipBoxes.push(el.getBoundingClientRect().right);
      }
      if(clipBoxes.length){
        const clipRight=Math.min(...clipBoxes);
        for(const r of badgeTextRects(trigger)){
          if(r.right>clipRight+1)deficit=Math.max(deficit,r.right-clipRight);
        }
      }
    }
    return deficit;
  }
  function effectiveModelDeficit(branch,trigger){
    const raw=modelTruncationDeficit(branch,trigger);
    if(raw<=0)return 0;
    let cap=Infinity;
    for(const el of [branch,trigger]){
      if(!el?.isConnected)continue;
      const css=getComputedStyle(el);
      if(css.maxWidth&&css.maxWidth.endsWith('px')){
        const maxW=parseFloat(css.maxWidth);
        if(Number.isFinite(maxW))cap=Math.min(cap,Math.max(0,maxW-el.getBoundingClientRect().width));
      }
    }
    return Math.min(raw,cap);
  }
  function naturalFlexItemWidth(el,withDeficit=false,trigger=null){
    if(!el?.isConnected)return 0;
    const css=getComputedStyle(el);
    if(css.display==='none'||css.visibility==='hidden'||['absolute','fixed'].includes(css.position))return 0;
    const deficit=withDeficit?effectiveModelDeficit(el,trigger):0;
    const grow=parseFloat(css.flexGrow)||0;
    let result=0;
    if(grow>0){
      const kids=Array.from(el.children).filter(c=>{
        if(c===node||isPulseBar(c))return false;
        const cs=getComputedStyle(c);
        return cs.display!=='none'&&cs.visibility!=='hidden'&&!['absolute','fixed'].includes(cs.position)&&c.getClientRects().length>0;
      });
      const pad=(parseFloat(css.paddingLeft)||0)+(parseFloat(css.paddingRight)||0)+(parseFloat(css.borderLeftWidth)||0)+(parseFloat(css.borderRightWidth)||0);
      if(!kids.length){
        const text=el.textContent?.trim();
        result=!text?Math.max(0,parseFloat(css.minWidth)||0):Math.ceil(Math.max(el.scrollWidth,el.getBoundingClientRect().width+deficit));
      }else{
        const gap=parseFloat(css.columnGap)||0;
        const kidsWidth=kids.reduce((sum,c)=>sum+naturalFlexItemWidth(c,withDeficit,trigger&&c.contains(trigger)?trigger:null),0)+gap*Math.max(0,kids.length-1);
        result=Math.ceil(Math.max(parseFloat(css.minWidth)||0,kidsWidth+pad));
      }
    }else{
      result=Math.ceil(Math.max(el.scrollWidth,el.getBoundingClientRect().width+deficit));
    }
    if(css.maxWidth&&css.maxWidth.endsWith('px')){
      const maxW=parseFloat(css.maxWidth);
      if(Number.isFinite(maxW))result=Math.min(result,Math.ceil(maxW));
    }
    return result;
  }
  function minMainBranchWidth(branch,trigger,reserve){
    if(!branch?.isConnected)return 0;
    const css=getComputedStyle(branch);
    const branchMin=parseFloat(css.minWidth)||0;
    if(!trigger||branch===trigger)return Math.min(reserve,Math.ceil(Math.max(32,branchMin)));
    const kids=Array.from(branch.children).filter(c=>{
      if(c===node||isPulseBar(c)||!c.getClientRects().length)return false;
      const cs=getComputedStyle(c);
      return cs.display!=='none'&&cs.visibility!=='hidden'&&!['absolute','fixed'].includes(cs.position);
    });
    const pad=(parseFloat(css.paddingLeft)||0)+(parseFloat(css.paddingRight)||0)+(parseFloat(css.borderLeftWidth)||0)+(parseFloat(css.borderRightWidth)||0);
    const gap=parseFloat(css.columnGap)||0;
    const nonModel=kids.reduce((sum,c)=>sum+(c===trigger||c.contains(trigger)?32:naturalFlexItemWidth(c,false)),0);
    return Math.min(reserve,Math.ceil(Math.max(branchMin,nonModel+gap*Math.max(0,kids.length-1)+pad)));
  }
  function nativeComfortable(){
    if(isFooter())return true;
    const baseline=composer.native;
    if(!baseline)return true;
    if(composer.branch.getBoundingClientRect().height>baseline.height+1)return false;
    if(baseline.icons.some(({icon,width})=>icon.isConnected&&icon.getBoundingClientRect().width<width-.5))return false;
    if(composer.kind==='main'&&!node.classList.contains('icons-only')&&!node.classList.contains('minimal-icon')){
      const trigger=currentModelTrigger();
      if(effectiveModelDeficit(composer.branch,trigger)>0.5)return false;
    }
    if(composer.kind==='ide'&&composer.branch.getBoundingClientRect().width<baseline.reserve-1)return false;
    if(composer.kind==='subagent'){
      if(composer.branch.getBoundingClientRect().width<baseline.reserve-1)return false;
      const lines=new Set(badgeTextRects(composer.anchor).map(r=>Math.round(r.top)));
      if(lines.size>1)return false;
    }
    return true;
  }
  function reserveNativeSpace(){
    if(isFooter()||!['main','subagent','ide'].includes(composer.kind)){if(node.style.getPropertyValue('--pulse-native-room'))node.style.removeProperty('--pulse-native-room');if(node.classList.contains('native-no-room'))node.classList.remove('native-no-room');return;}
    const row=composer.row,style=getComputedStyle(row),siblings=Array.from(row.children).filter(e=>{if(e===node||e===composer.branch||!e.getClientRects().length)return false;const s=getComputedStyle(e);return s.display!=='none'&&!['absolute','fixed'].includes(s.position);});
    const trigger=composer.kind==='main'?currentModelTrigger():null;
    const reserve=composer.kind==='main'?naturalFlexItemWidth(composer.branch,true,trigger):(composer.native?.reserve||0);
    const siblingWidth=siblings.reduce((sum,e)=>{
      if(composer.kind==='main')return sum+naturalFlexItemWidth(e,false);
      const s=getComputedStyle(e);
      return sum+e.getBoundingClientRect().width+(parseFloat(s.marginLeft)||0)+(parseFloat(s.marginRight)||0);
    },0);
    const sharedRoom=row.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)-siblingWidth-(parseFloat(style.columnGap)||0)*(siblings.length+1)-2;
    const visibleChips=root?Array.from(root.querySelectorAll('.bar .chip')).filter(c=>!c.hidden).length:3;
    const minStripWidth=stripMode.mode==='minimal'?24:(visibleChips>0?visibleChips*24+Math.max(0,visibleChips-1)*2:0);
    if(composer.kind==='main'){
      const room=sharedRoom-reserve;
      const minBranch=minMainBranchWidth(composer.branch,trigger,reserve);
      const noRoom=minStripWidth>0&&sharedRoom<minStripWidth+minBranch;
      const budget=noRoom?Math.max(0,Math.floor(sharedRoom-minBranch)):Math.max(minStripWidth,Math.floor(room));
      const width=`${budget}px`;
      if(node.style.getPropertyValue('--pulse-native-room')!==width)node.style.setProperty('--pulse-native-room',width);
      node.classList.toggle('native-no-room',noRoom);
      return;
    }
    const room=sharedRoom-reserve;
    const width=`${Math.max(0,Math.floor(room))}px`;if(node.style.getPropertyValue('--pulse-native-room')!==width)node.style.setProperty('--pulse-native-room',width);
    // A hidden ribbon must release its flex space as well as its hit targets.
    // The budget is independent of our own rectangle, so it recovers directly
    // when the sidebar is closed, without probing the native badge each frame.
    node.classList.toggle('native-no-room',minStripWidth>0&&room<minStripWidth);
  }
  function currentModelTrigger(){
    const trigger=composer?.model?.isConnected?composer.model:(composer?.branch||composer?.row)?.querySelector('[data-testid="model-selector-trigger"]');
    if(trigger&&composer&&trigger!==composer.model)composer.model=trigger;
    return trigger||null;
  }
  function composerModelSignature(){
    const trigger=currentModelTrigger();
    if(!trigger)return null;
    return `${trigger.getAttribute('aria-label')||''}\n${trigger.getAttribute('title')||''}\n${trigger.textContent||''}`;
  }
  function currentComposerModel(){
    const trigger=currentModelTrigger();
    if(!trigger)return '';
    const tagged=[trigger.getAttribute('aria-label'),trigger.getAttribute('title'),trigger.textContent].map(cleanModelText).filter(Boolean);
    const matched=tagged.find(c=>language.quotaGroupKind({name:c}));
    if(matched)return matched;
    return [trigger.textContent,trigger.getAttribute('title'),trigger.getAttribute('aria-label')].map(cleanModelText).find(Boolean)||'';
  }
  function syncModelChoice({renderNow=true}={}){
    const sig=composerModelSignature();
    if(sig===null){lastModelSig=null;return false;}
    if(lastModelSig===null){lastModelSig=sig;return false;}
    if(sig===lastModelSig)return false;
    const hadValue=Boolean(lastModelSig.replace(/\s+/g,''));
    lastModelSig=sig;chosen=null;
    if(renderNow&&data)render();
    return hadValue;
  }
  function observeComposer(){
    resizeObserver?.disconnect();
    resizeObserver??=new ResizeObserver(scheduleLayout);
    for(const element of new Set([node,composer.row,composer.row.parentElement,composer.branch,composer.editor]))resizeObserver.observe(element);
    modelObserver?.disconnect();
    const targets=new Set([composer.row,composer.model].filter(Boolean));
    if(targets.size){
      modelObserver??=new MutationObserver(records=>{
        if(!records.some(r=>!isOwnNode(r.target)))return;
        if(syncModelChoice({renderNow:true})&&!pending&&node?.isConnected)void refresh();
      });
      for(const target of targets)modelObserver.observe(target,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','data-testid']});
    }
  }
  // Pointer clicks and dialog focus restoration leave buttons focused after
  // the pointer departs. Only keyboard-visible focus keeps a card engaged.
  // The explicit first-use action moves focus into language choices. Keep
  // that guided destination available until the user chooses or leaves it.
  const isRemoteFallback=()=>data?.remoteSession?.mode==='fallback';
  const effectiveHiddenSet=()=>isRemoteFallback()?new Set(['speed','cache','context']):new Set(barPrefs.hidden);
  const footerHostCard=()=>{const hiddenSet=effectiveHiddenSet();if(!hiddenSet.has('context'))return 'context';const vis=barPrefs.order.filter(id=>!hiddenSet.has(id));return vis[vis.length-1]||'quota';};
  const cardEngaged=()=>Boolean(root?.activeElement?.matches(':focus-visible')||(guideOpened&&!guideDismissed&&cardName===footerHostCard()&&root?.activeElement?.matches('[data-language-choice]'))||node?.matches(':hover')||root?.querySelector('.card:not([hidden]):hover'));
  function cardVisibility(element,visible){
    if(visible){hidden(element,false);if(element.hasAttribute('popover')&&!element.matches(':popover-open'))element.showPopover();}
    else {if(element.hasAttribute('popover')&&element.matches(':popover-open'))element.hidePopover();hidden(element,true);}
  }
  let cardSide=null;
  let ignoreLeaveUntil=0,ignoreHoverUntil=0;
  // Each strip chip maps 1:1 to its own detail popover card.
  const cardIdFor=name=>`${name}-card`;
  function hide({keepWarm=false}={}){
    clearTimeout(openTimer);openTimer=null;
    clearTimeout(hoverTimer);hoverTimer=null;
    if(!keepWarm)warmUntil=0;
    changingCards=true;
    try{cardName=null;cardSide=null;for(const e of root?.querySelectorAll('[data-card]')||[])e.setAttribute('aria-expanded','false');for(const e of root?.querySelectorAll('.card')||[])cardVisibility(e,false);}
    finally{changingCards=false;}
    updateGuide();
  }
  function show(name){
    if(disposed||instDisposed||parked||!node?.isConnected||changingCards||usageDashboard?.isOpen||node.dataset.layout==='blocked')return;
    for(const other of instances){if(other.node!==node)other.hide();other.closeSettings?.({restoreFocus:false});}
    if(settingsOpen)closeSettingsModal({restoreFocus:false});
    clearTimeout(hoverTimer);hoverTimer=null;
    clearTimeout(openTimer);openTimer=null;
    if(cardName!==name)cardSide=null;
    cardName=name;warmUntil=0;
    for(const e of root.querySelectorAll('[data-card]'))e.setAttribute('aria-expanded',String(e.dataset.card===name));
    changingCards=true;
    try{const cardId=cardIdFor(name);for(const e of root.querySelectorAll('.card'))cardVisibility(e,e.id===cardId);}
    finally{changingCards=false;}
    updateGuide();
    position();
    if(name==='quota')void hoverQuotaRefresh();
    if(name==='context')contextDetailRefresh();
  }
  function hoverChip(name){
    if(cardName&&cardName!==name&&Date.now()<ignoreHoverUntil)return;
    clearTimeout(hoverTimer);
    if(name==='quota')void hoverQuotaRefresh();
    if(name==='context')contextDetailRefresh();
    if(isWarm()){
      clearTimeout(openTimer);openTimer=null;
      show(name);
    }else{
      clearTimeout(openTimer);
      const anchor=node,chip=root?.querySelector(`[data-card="${name}"]`),editor=composer?.editor,conversation=conversationId();
      openTimer=setTimeout(()=>{
        openTimer=null;
        // A host route/composer replacement can detach the chip without a
        // pointerleave. Never show a stale or disconnected top-layer popover.
        if(disposed||instDisposed||parked||node!==anchor||!anchor?.isConnected||!chip?.isConnected||!chip.matches(':hover')||composer?.editor!==editor||conversationId()!==conversation)return;
        show(name);
      },HOVER_DELAY);
    }
  }
  function leaveChip(){
    clearTimeout(openTimer);openTimer=null;
  }
  function scheduleHide(){
    if(Date.now()<ignoreLeaveUntil)return;
    clearTimeout(openTimer);openTimer=null;
    clearTimeout(hoverTimer);
    // Measure the warm window from pointer departure, not the later hide.
    if(cardName)warmUntil=Date.now()+WARM_WINDOW;
    hoverTimer=setTimeout(()=>{hoverTimer=null;if(!cardEngaged())hide({keepWarm:true});},LEAVE_DELAY);
  }
  function position(){
    positionGuide();
    positionSettings();
    if(!cardName)return;
    const button=root.querySelector(`[data-card="${cardName}"]`),card=$(cardIdFor(cardName)),rect=button.getBoundingClientRect();
    const width=Math.min(312,window.innerWidth-24);style(card,'width',`${width}px`);
    const roomAbove=rect.top-21,roomBelow=window.innerHeight-rect.bottom-21;
    style(card,'overflow-y','auto');
    style(card,'left',`${Math.min(window.innerWidth-width-12,Math.max(12,rect.left+rect.width/2-width/2))}px`);
    // scrollHeight includes clipped content. Expanding maxHeight to measure it
    // on every poll used to reset scrollTop and then shrink the card again.
    const height=card.scrollHeight+card.offsetHeight-card.clientHeight;
    const useAbove=cardSide?cardSide==='above':(height<=roomAbove || roomAbove>=roomBelow);
    cardSide=useAbove?'above':'below';
    style(card,'max-height',`${Math.max(80,useAbove?roomAbove:roomBelow)}px`);
    style(card,'top',`${Math.max(12,useAbove?rect.top-card.offsetHeight-9:rect.bottom+9)}px`);
  }
  function positionGuide(){
    const tip=$('language-guide'),button=root?.querySelector(`[data-card="${footerHostCard()}"]`);
    if(!tip||tip.hidden||!button)return;
    const rect=button.getBoundingClientRect(),width=Math.min(244,innerWidth-24);
    style(tip,'width',`${width}px`);
    const left=Math.max(12,Math.min(innerWidth-width-12,rect.left+rect.width/2-width/2));
    style(tip,'left',`${left}px`);
    style(tip,'--guide-anchor',`${Math.max(16,Math.min(width-16,rect.left+rect.width/2-left))}px`);
    const above=rect.top-22,below=innerHeight-rect.bottom-22,height=tip.scrollHeight+tip.offsetHeight-tip.clientHeight,useAbove=height<=above||above>=below;
    style(tip,'max-height',`${Math.max(80,useAbove?above:below)}px`);
    style(tip,'top',`${Math.max(12,useAbove?rect.top-tip.offsetHeight-10:rect.bottom+10)}px`);
    attribute(tip,'data-side',useAbove?'above':'below');
  }
  function positionSettings(){
    if(!settingsOpen||!settingsDialog||settingsDialog.hidden||!root)return;
    const anchor=root.querySelector(`[data-card="${footerHostCard()}"]`)||root.querySelector('.bar')||node;
    if(!anchor)return;
    const rect=anchor.getBoundingClientRect();
    const width=Math.min(492,window.innerWidth-24);
    style(settingsDialog,'width',`${width}px`);
    const left=Math.min(window.innerWidth-width-12,Math.max(12,rect.left+rect.width/2-width/2));
    style(settingsDialog,'left',`${left}px`);
    const roomAbove=rect.top-20,roomBelow=window.innerHeight-rect.bottom-20;
    const useAbove=roomAbove>=180||roomAbove>=roomBelow;
    const maxH=Math.max(120,Math.min(540,useAbove?roomAbove:roomBelow));
    style(settingsDialog,'max-height',`${maxH}px`);
    const shell=settingsDialog.firstElementChild;
    if(shell)style(shell,'max-height',`${maxH}px`);
    const h=Math.min(maxH,settingsDialog.offsetHeight||maxH);
    style(settingsDialog,'top',`${Math.max(12,useAbove?rect.top-h-9:rect.bottom+9)}px`);
  }
  function updateGuide(){
    const tip=$('language-guide');if(!tip)return;
    const tw=language.language==='zh-TW',hint=tip.querySelector('#guide-open span[lang]');
    const heading=tip.querySelector('.guide-heading strong span'),headingText=tw?'/ 語言':'/ 语言',hintText=tw?'在上下文詳細資料中切換語言':'在上下文详情中切换语言';
    if(heading.textContent!==headingText)heading.textContent=headingText;
    attribute(hint,'lang',tw?'zh-TW':'zh-CN');if(hint.textContent!==hintText)hint.textContent=hintText;
    attribute($('guide-close'),'aria-label',tw?'Dismiss language tip / 關閉語言提示':'Dismiss language tip / 关闭语言提示');
    const visible=!disposed&&!instDisposed&&!parked&&isPrimary&&guideReady&&!guideDismissed&&!guideOpened&&!cardName&&node?.isConnected&&['main','ide'].includes(composer?.kind)&&node.dataset.layout==='ready'&&node.style.visibility!=='hidden';
    const entering=visible&&tip.hidden;
    cardVisibility(tip,visible);
    const button=root.querySelector(`[data-card="${footerHostCard()}"]`);
    for(const el of root.querySelectorAll('[data-card][aria-describedby]'))if(el!==button||!visible)el.removeAttribute('aria-describedby');
    if(visible&&button&&button.getAttribute('aria-describedby')!=='language-guide')button.setAttribute('aria-describedby','language-guide');
    text('guide-save-note',guideError?(tw?'Could not save. Please retry. / 未能儲存，請重試。':'Could not save. Please retry. / 未能保存，请重试。'):'');
    $('guide-close').disabled=guideSaving;
    positionGuide();
    if(entering)tip.animate([{opacity:0,transform:`translateY(${tip.dataset.side==='above'?'4':'-4'}px)`},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'cubic-bezier(0.23,1,0.32,1)'});
  }
  async function dismissGuide(){
    if(guideSaving)return;guideSaving=true;guideError=false;updateGuide();
    try{const value=await window.agPulseHost.setPreferences({languageGuideDismissed:true});if(value?.languageGuideDismissed!==true||value.error)throw new Error('Guide not saved');syncGuide(value);preferences.sync(value);}
    catch{guideError=true;}
    finally{guideSaving=false;updateGuide();}
  }
  function park(){
    if(composer?.kind)parkedKind=composer.kind;
    stopDensityMotion();densityFrame=null;densityProbe=null;composer=null;resizeObserver?.disconnect();modelObserver?.disconnect();
    if(!node)return;
    parked=true;hide();node.dataset.layout='blocked';
    if(node.parentElement!==document.body){document.body.append(node);themeController?.update();}
    usageDashboard?.restoreModal();
  }
  function dispose(){
    instDisposed=true;requestEpoch++;pending=false;refreshRequest=null;manualRequest=null;hoverQuotaRequest=null;
    clearTimeout(hoverTimer);clearTimeout(openTimer);stopDensityMotion();densityFrame=null;densityProbe=null;composer=null;
    resizeObserver?.disconnect();modelObserver?.disconnect();themeController?.dispose();hide();
    usageDashboard?.dispose();usageDashboard=null;updateMenu?.dispose();updateMenu=null;themeController=null;
    if(settingsOpen)closeSettingsModal({restoreFocus:false});
    clearTimeout(settingsHighlightTimer);settingsHighlightTimer=0;
    remoteSessionNote=languageRow=settingsDialog=settingsTrigger=saveNote=null;settingsOpen=false;lastBarLayoutSig='';lastFooterHost='context';lastSettingsSig='';draggingChipId=null;
    node?.remove();node=null;root=null;
  }
  function mountTo(found){
    if(disposed||instDisposed)return;
    parked=false;parkedKind=found.kind;
    found.native=composer?.branch===found.branch&&composer?.anchor===found.anchor?composer.native:captureNative(found);
    if(found.kind==='ide')found.native.reserve=surface.nativeReserve(found);
    const prevModel=composer?.model;
    composer=found;
    const modelChanged=syncModelChoice({renderNow:false});
    const convChanged=syncConversation();
    if(node&&(convChanged||(modelChanged&&data)))render();
    const {row,branch}=found;
    const footer=isFooter(found);
    const targetParent=footer?row.parentElement:row;
    const targetAnchor=footer?row:branch;
    const targetPlacement=footer?'footer':'inline';
    if(node)node.dataset.scope=found.kind;
    if(node?.isConnected&&node.parentElement===targetParent&&node.previousElementSibling===targetAnchor&&node.dataset.placement===targetPlacement){if(found.model&&found.model!==prevModel)observeComposer();return;}
    if(node){
      stopDensityMotion();densityFrame=null;densityProbe=null;hide();
      targetParent.insertBefore(node,targetAnchor.nextSibling);applyPlacementStyle(footer);observeComposer();
      themeController?.dispose();themeController=theme.attach(node,{embedded:true,onChange:()=>{if(!disposed&&!instDisposed){if(settingsOpen)renderSettingsModal();scheduleLayout();}}});
      if(data?.theme)themeController.setHostTheme(data.theme);
      themeController.setThemeMode?.(themeModePref.value);
      themeController.setBarColors?.(barColorsPref.colors);
      attribute(node,'data-cache-hit-tone',cacheHitTone.value);
      usageDashboard?.restoreModal?.();
      fit();position();
      return;
    }
    resizeObserver?.disconnect();modelObserver?.disconnect();node=document.createElement('div');
    if(stripMode.mode==='minimal')node.classList.add('minimal','minimal-empty');
    else node.classList.add('icons-only');
    node.dataset.agPulseBar='true';
    node.dataset.pulseWidget='true';
    node.dataset.scope=found.kind;
    applyPlacementStyle(footer);
    root=node.attachShadow({mode:'open'});
    setMarkup(root,`<style>${theme.shadowCss()}
      :host{flex:0 999 auto;color-scheme:var(--pulse-scheme);font-family:var(--pulse-font,-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif);color:var(--pulse-foreground);font-size:11px}*{box-sizing:border-box}button,select{font:inherit}button{cursor:pointer}svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;flex:none}button:focus-visible,select:focus-visible{outline:2px solid var(--pulse-accent);outline-offset:2px}
      :host([data-placement=footer]){flex:0 0 auto;width:100%}:host([data-placement=footer]) .bar{justify-content:center;gap:6px;min-height:24px;padding:3px 6px 0;border-top:1px solid var(--pulse-separator)}:host([data-placement=footer].icons-only) .bar{gap:4px}
      .bar{display:flex;justify-content:flex-start;width:100%;align-items:center;gap:4px;min-height:28px;padding:0;border:0;background:none;overflow:clip;min-width:0;max-width:100%}.chip{display:flex;flex:0 0 auto;align-items:center;gap:3.5px;color:var(--pulse-chip);background:none;border:0;border-radius:6px;padding:2px 4px;font-size:11px;white-space:nowrap;line-height:18px;transition:background-color 140ms ease,color 140ms ease}.chip:hover,.chip[aria-expanded=true]{background:var(--pulse-hover);color:var(--pulse-hover-text)}.chip strong{font-weight:550;font-variant-numeric:tabular-nums}.dim{color:var(--pulse-muted)}.countdown{font-size:11px;font-variant-numeric:tabular-nums}.dot{width:4px;height:4px;background:var(--pulse-dot);border-radius:50%;flex:none}.dot.live{background:var(--pulse-success)}.dot.stale{background:var(--pulse-warning)}.group{color:var(--pulse-muted);font-size:11px;margin-right:1px}
      [data-card=speed] svg.cat-badge,[data-card=speed] #tps,[data-card=speed]>span:not(.rounds){color:var(--pulse-bar-speed,inherit)}
      [data-card=cache]>svg:first-child,[data-card=cache] .cache-total{color:var(--pulse-bar-token,inherit)}
      [data-card=quota] .ring-arc{stroke:var(--pulse-bar-quota,var(--pulse-quota-accent,var(--pulse-accent)))}[data-card=quota] .quota-text{color:var(--pulse-bar-quota,inherit)}
      [data-card=context] #context-percent,[data-card=context] .context-label{color:var(--pulse-bar-context,inherit)}
      :host(.icons-only) .bar{gap:3px}:host(.narrow) .bar{gap:1px}
      .card{position:fixed;inset:auto;margin:0;z-index:2147483000;padding:11px 14px;border-radius:12px;background:var(--pulse-card);box-shadow:0 6px 20px var(--pulse-shadow);border:1px solid var(--pulse-border);color:var(--pulse-foreground);font-size:12px}.card::backdrop{background:transparent;pointer-events:none}.card[hidden]{display:none}dl{margin:0}dl>[hidden]{display:none}
      .heading{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;margin-bottom:7px;border-bottom:1px solid var(--pulse-separator);font-weight:600;font-size:11px}.heading>span{display:flex;align-items:center;gap:6px}.hero-label{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:500;color:var(--pulse-muted)}.tag{font-size:11px;font-weight:400;color:var(--pulse-muted);white-space:nowrap}.heading .tag{max-width:52%;overflow:hidden;text-overflow:ellipsis}.tag:empty{display:none}
      .footnote{font-size:12px;color:var(--pulse-subtle);line-height:1.5;margin:8px 0 0}.footnote[hidden]{display:none}
      .track{height:4px;border-radius:999px;background:var(--pulse-track);margin:8px 0 0;overflow:hidden}.track i{height:100%;display:block;border-radius:999px;background:var(--pulse-accent);width:0}#context-fill{background:var(--pulse-context-accent,var(--pulse-accent))}
      .quota-spotlight-head{display:flex;align-items:center;gap:6px;min-width:0;flex:1 1 auto}.quota-spotlight-head[hidden]{display:none}.spot-dot{width:6px;height:6px;border-radius:50%;background:var(--pulse-quota-accent,var(--pulse-accent));flex:none}.spot-name{font-size:12px;font-weight:600;color:var(--pulse-foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pace-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:500;line-height:15px;white-space:nowrap;color:var(--pulse-label);background:var(--pulse-control);font-variant-numeric:tabular-nums}.pace-badge[hidden]{display:none}.pace-dot{width:5px;height:5px;border-radius:50%;background:var(--pulse-muted);flex:none}
      .pace-badge[data-pace=exhaust]{color:var(--pulse-warning);background:color-mix(in srgb,var(--pulse-warning) 14%,transparent)}.pace-badge[data-pace=exhaust] .pace-dot,.pace-badge[data-pace=tight] .pace-dot{background:var(--pulse-warning)}
      .pace-badge[data-critical=true]{color:var(--pulse-danger);background:color-mix(in srgb,var(--pulse-danger) 14%,transparent)}.pace-badge[data-critical=true] .pace-dot{background:var(--pulse-danger)}
      .pace-badge[data-pace=ok] .pace-dot{background:var(--pulse-success)}
      .quota-section .quota-track{position:relative;height:5px;overflow:hidden}.quota-track .track-actual{border-radius:999px;background:var(--pulse-quota-accent,var(--pulse-accent))}
      .quota-forecast{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px;font-size:11px;line-height:14px;color:var(--pulse-muted);font-variant-numeric:tabular-nums}.quota-forecast[hidden]{display:none}.forecast-main{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.forecast-main[hidden]{display:none}.forecast-main[data-alert=true]{color:var(--pulse-label);font-weight:500}
      .usage-hint{flex:none;margin-left:auto;font-size:10.5px;line-height:13px;color:var(--pulse-subtle);border-bottom:1px dashed var(--pulse-border);white-space:nowrap;cursor:help}.usage-hint[hidden]{display:none}
      .quota-siblings{display:flex;flex-direction:column;gap:2px;margin-top:7px;padding-top:6px;border-top:1px solid var(--pulse-separator)}.quota-siblings[hidden]{display:none}
      .quota-sibling{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:5px 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--pulse-label);font-size:11px;line-height:15px;text-align:left;transition:background-color 120ms ease,border-color 120ms ease,color 120ms ease}.quota-sibling:hover,.quota-sibling:focus-visible{background:var(--pulse-hover);border-color:var(--pulse-border);color:var(--pulse-foreground)}
      .sibling-label{display:inline-flex;align-items:center;gap:5px;min-width:0;flex:1 1 auto;font-weight:500}.sibling-dot{width:5px;height:5px;border-radius:50%;background:var(--pulse-muted);opacity:.65;flex:none}.sibling-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .sibling-metrics{display:inline-flex;align-items:center;gap:8px;flex:none;font-variant-numeric:tabular-nums}.sibling-win{display:inline-flex;align-items:center;gap:4px}.sibling-tag{color:var(--pulse-muted)}.sibling-val{color:var(--pulse-foreground);font-weight:550}.sibling-bar{display:block;width:24px;height:3px;border-radius:999px;background:var(--pulse-track);overflow:hidden}.sibling-bar i{display:block;height:100%;width:0;border-radius:999px;background:color-mix(in srgb,var(--pulse-quota-accent,var(--pulse-accent)) 68%,transparent)}
      .refresh{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:5px;color:var(--pulse-muted);border:0;background:transparent;padding:0}.refresh:hover{color:var(--pulse-foreground);background:var(--pulse-hover)}.refresh[aria-busy=true]{color:var(--pulse-emphasis);cursor:wait}.refresh[aria-busy=true] svg{animation:pulse-refresh-spin 1s linear infinite;transform-origin:center}
      .quota-spinner{width:14px;height:14px;border-radius:4px;pointer-events:none;flex:none}.quota-spinner[hidden]{display:none}
      @keyframes pulse-refresh-spin{to{transform:rotate(360deg)}}
      @media(prefers-reduced-motion:reduce){.refresh[aria-busy=true] svg{animation:none;opacity:.65}}
      .reset{color:var(--pulse-emphasis)}.rounds,.group,.dot.live{display:none}.chip[hidden]{display:none}
      [data-card=context][data-ctx-mode=rounds][data-has-rounds=true] .context-label,[data-card=context][data-ctx-mode=compact] .context-label{display:none}.context-rounds{font-variant-numeric:tabular-nums;white-space:nowrap}.context-rounds[hidden]{display:none}
      :host(.compact) .countdown{display:none}:host(.narrow) .cache-total,:host(.narrow) .chip svg,:host(.narrow) .context-label{display:none}:host(.narrow) .chip{padding:2px 3px;font-size:11px}:host(.narrow) .bar{gap:1px}:host(.narrow) [data-card=quota] .quota-text{display:none}:host(.narrow) [data-card=quota] svg,:host(.narrow) [data-card=cache] svg:first-child{display:block}
      .cache-hit{font-variant-numeric:tabular-nums;font-weight:600;--pulse-hit-high:var(--pulse-bar-cacheHit,var(--pulse-accent));color:var(--pulse-hit-high)}.cache-hit[hidden]{display:none}:host([data-cache-hit-tone=semantic]) .cache-hit{--pulse-hit-high:var(--pulse-bar-cacheHit,var(--pulse-success,var(--pulse-accent)))}:host([data-cache-hit-tiers=true]) .cache-hit[data-tone=high]{color:var(--pulse-bar-cacheHitHigh,var(--pulse-hit-high))}:host([data-cache-hit-tiers=true]) .cache-hit[data-tone=mid]{color:var(--pulse-bar-cacheHitMid,color-mix(in srgb,var(--pulse-hit-high) 62%,var(--pulse-muted)))}:host([data-cache-hit-tiers=true]) .cache-hit[data-tone=low]{color:var(--pulse-bar-cacheHitLow,color-mix(in srgb,var(--pulse-hit-high) 28%,var(--pulse-muted)))}:host([data-cache-hit-tiers=true]) .cache-hit[data-tone=cold]{color:var(--pulse-bar-cacheHitCold,var(--pulse-muted))}:host(:not([data-cache-chip-mode=hit]):not(.icons-only):not(.narrow)) .cache-hit:not(:empty)::before{content:'·';margin-right:4px;color:var(--pulse-muted);font-weight:400}:host([data-cache-chip-mode=hit]) .cache-total{display:none!important}:host([data-cache-chip-mode=tokens]) .cache-hit,:host([data-inline-cache-hit=false]) .cache-hit{display:none!important}
      :host(.icons-only) .bar{gap:2px}:host([data-scope=main].icons-only){flex-shrink:0}:host(.icons-only:not(.minimal)) .strip-toggle{display:none}:host(.icons-only) .chip{flex:0 0 24px;width:24px;min-width:24px;height:24px;padding:0;gap:0;justify-content:center}:host(.icons-only) .chip:focus-visible{outline-offset:-2px}:host(.icons-only) .chip>:not(svg):not(.context-ring){display:none}:host(.icons-only) .bar>.dot{display:none}
      .strip-toggle{display:inline-grid;place-items:center;flex:none;width:16px;height:22px;padding:0;margin:0 -2px 0 0;border:0;border-radius:5px;background:transparent;color:var(--pulse-muted);opacity:.46;transition:opacity 140ms ease,color 140ms ease,background-color 140ms ease,transform 120ms ease}.bar:hover .strip-toggle,.strip-toggle:hover,.strip-toggle:focus-visible{opacity:1}.strip-toggle:hover{background:var(--pulse-hover);color:var(--pulse-hover-text)}.strip-toggle:active{transform:scale(.94)}.strip-toggle[data-save-failed=true]{opacity:1;color:var(--pulse-warning)}.strip-toggle svg{width:11px;height:11px;stroke-width:1.45;transition:transform 180ms cubic-bezier(0.32,0.72,0,1)}:host(.minimal) .strip-toggle svg{transform:rotate(180deg)}
      @media(prefers-reduced-motion:reduce){.strip-toggle,.strip-toggle svg{transition:none}.strip-toggle:active{transform:none}}
      :host(.compact-text) .bar{gap:3px}:host(.compact-text) .chip{padding:2px 3px;gap:3px}:host(.compact-text) [data-card=speed]>span:not(.rounds),:host(.compact-text) .cache-unit{display:none!important}
      :host(.snug-rounds) .bar{gap:1.5px}:host(.snug-rounds) .strip-toggle{width:12px;margin-right:-2px}:host(.snug-rounds) .chip{padding:2px 1.5px;gap:2px}:host(.snug-rounds) .quota-text{gap:2px}:host(.snug-rounds:not([data-cache-chip-mode=hit]):not(.icons-only):not(.narrow)) .cache-hit:not(:empty)::before{margin-right:2px}
      :host(.mini-rounds) .chip{font-size:10.5px}:host(.mini-rounds) .chip svg{width:11.5px;height:11.5px}:host(.mini-rounds) .chip svg.cat-badge{width:13px;height:8.5px}:host(.mini-rounds) .chip .context-ring{width:11px;height:11px}
      :host(.tight-text) .context-rounds,:host(.tight-text) .context-label{display:none!important}
      :host(.trim-hit:not([data-cache-chip-mode=hit])) .cache-hit{display:none!important}
      :host(.dense-text) .quota-tag,:host(.dense-text) .quota-secondary{display:none!important}
      :host(.minimal) .bar{gap:2px}:host(.minimal) .bar>.dot{display:none}
      :host(.minimal.icons-only) .strip-toggle{display:inline-grid}:host(.minimal.icons-only) [data-card=cache]>.cache-hit{display:none!important}:host(.minimal.icons-only) [data-card=cache]{flex:0 0 24px!important;width:24px!important;padding:0!important;gap:0!important}
      :host(.minimal.minimal-icon) .strip-toggle,:host(.minimal.minimal-icon) [data-card="speed"],:host(.minimal.minimal-icon) [data-card="cache"],:host(.minimal.minimal-icon) [data-card="quota"],:host(.minimal.minimal-icon) #context-percent,:host(.minimal.minimal-icon) .context-label,:host(.minimal.minimal-icon) .context-rounds{display:none!important}:host(.minimal.minimal-icon) [data-card="context"]{display:flex!important;flex:0 0 24px;width:24px;min-width:24px;height:24px;padding:0;gap:0;justify-content:center}
      .strip-mode-options{display:inline-flex;gap:1px;padding:2px;border-radius:6px;background:var(--pulse-control);flex:none}
      .strip-mode-button{display:grid;place-items:center;width:22px;height:18px;padding:0;margin:0;border:0;border-radius:4px;background:none;color:var(--pulse-muted);opacity:.72;cursor:pointer;transition:background-color 140ms ease,color 140ms ease,opacity 140ms ease,transform 120ms ease}
      .strip-mode-button:hover{opacity:1;color:var(--pulse-hover-text);background:var(--pulse-hover)}.strip-mode-button:active{transform:scale(.94)}
      .strip-mode-button[aria-pressed=true]{opacity:1;color:var(--pulse-foreground);background:var(--pulse-hover);box-shadow:0 1px 2px var(--pulse-shadow)}.strip-mode-button[data-save-failed=true]{color:var(--pulse-warning)}
      .strip-mode-button svg{width:13px;height:9px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;overflow:visible}
      :host([data-layout=blocked]){visibility:hidden!important;pointer-events:none!important}:host(.native-no-room){flex:0 0 0px!important;width:0!important;max-width:0!important;margin:0!important}
      .density-stage{position:absolute;overflow:clip;pointer-events:none;user-select:none}.density-piece{pointer-events:none!important}
      .scope-note{margin:6px 0 0;color:var(--pulse-muted);font-size:11px}:host([data-scope=main]) .scope-note,:host([data-scope=ide]) .scope-note{display:none}
      .context-ring{display:inline-block;flex:none;width:12px;height:12px;border-radius:50%;background:conic-gradient(var(--ring-color,var(--pulse-ring)) var(--used-angle,0deg),var(--pulse-ring-track) 0);mask:radial-gradient(circle,transparent 43%,#000 47%)}
      .collection-notice{margin:8px 0 0;padding:7px 0;border-top:1px solid var(--pulse-separator);border-bottom:1px solid var(--pulse-separator);font-size:11px;line-height:1.5}.collection-notice[hidden]{display:none}.collection-notice div{margin:2px 0}.collection-notice summary{cursor:pointer;color:var(--pulse-label)}.collection-notice a{color:var(--pulse-emphasis);text-decoration:underline}.collection-notice strong{color:var(--pulse-warning)}.collection-state::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--pulse-warning);margin-right:6px;vertical-align:1px}
      :host(:not([data-collection=limited])) .collection-warning{display:none!important}.collection-warning,.collection-processing{display:none}.collection-label{display:none}:host([data-collection=limited]) [data-card=cache]{color:var(--pulse-warning)}:host([data-collection=limited]) [data-card=cache]>svg:first-child{display:none}:host([data-collection=limited]) [data-card=cache]>.collection-warning{display:block}:host([data-collection=limited]) [data-card=cache]>:not(svg){display:none}:host([data-collection=limited]) [data-card=cache]>.collection-label{display:inline}:host([data-collection=limited].icons-only) [data-card=cache]>.collection-label{display:none}
      :host([data-collection=processing]) .collection-state::before{background:var(--pulse-emphasis)}:host([data-collection=processing]) .collection-notice strong,:host([data-collection=processing]) [data-card=cache]{color:var(--pulse-emphasis)}:host([data-collection=processing]) [data-card=cache]>svg:first-child,:host([data-collection=processing]) [data-card=cache]>:not(svg){display:none}:host([data-collection=processing]) [data-card=cache]>.collection-processing{display:block}:host([data-collection=processing]) [data-card=cache]>.collection-label{display:inline}:host([data-collection=processing].icons-only) [data-card=cache]>.collection-label{display:none}:host(:not([data-collection=processing])) .collection-processing{display:none!important}
      [data-card=cache]{position:relative}[data-card=cache][data-task-current-only=true]::after{content:'!';position:absolute;top:0;left:13px;z-index:1;width:9px;height:9px;border-radius:50%;background:var(--pulse-warning);color:var(--pulse-background);font-size:7px;font-weight:700;line-height:9px;text-align:center;pointer-events:none}
      :host(:not(.icons-only)) [data-card=context][data-update-available=true]{padding-right:12px}
      [data-card=context]{position:relative}[data-card=context][data-update-available=true]::after{content:'';position:absolute;top:3px;right:3px;z-index:1;width:6px;height:6px;border-radius:50%;background:var(--pulse-success);box-shadow:0 0 0 1.5px var(--pulse-card);pointer-events:none}
      :host(.icons-only) [data-card=context][data-update-available=true]::after{top:2px;right:2px}
      .quota-ring{stroke-width:2.6}.quota-ring .ring-track{stroke:var(--pulse-track)}.quota-ring .ring-arc{stroke:var(--pulse-quota-accent,var(--pulse-accent));transition:stroke .3s}
      .quota-text{display:inline-flex;align-items:center;gap:3px;min-width:0;white-space:nowrap;font-variant-numeric:tabular-nums}
      [data-card=quota]{position:relative}[data-card=quota][data-quota-level=warn] .ring-arc{stroke:var(--pulse-warning)}[data-card=quota][data-quota-level=danger] .ring-arc{stroke:var(--pulse-danger)}[data-card=quota][data-quota-level=unknown] .ring-arc{stroke:var(--pulse-muted);opacity:.7}
      [data-card=quota][data-quota-dot]::after{content:'';position:absolute;top:1px;left:14px;z-index:1;width:6px;height:6px;border-radius:50%;box-shadow:0 0 0 1.5px var(--pulse-card);pointer-events:none}
      [data-card=quota][data-quota-dot=warn]::after{background:var(--pulse-warning)}[data-card=quota][data-quota-dot=danger]::after{background:var(--pulse-danger)}
      :host(.icons-only) [data-card=quota][data-quota-dot]::after{left:15px}
      #transcript-details{margin-top:10px;border-top:1px solid var(--pulse-separator);padding-top:9px}#transcript-details summary{cursor:pointer;font-size:11px;color:var(--pulse-label)}#transcript-total{float:right;margin-left:8px;font-variant-numeric:tabular-nums;color:var(--pulse-foreground);font-size:11px}
      :host{--cat:var(--pulse-accent);--cat-shade:color-mix(in srgb,var(--pulse-accent) 70%,var(--pulse-background));--cat-light:color-mix(in srgb,var(--pulse-accent) 18%,var(--pulse-foreground));--cat-outline:color-mix(in srgb,var(--pulse-accent) 28%,var(--pulse-background));--cat-pink:color-mix(in srgb,var(--pulse-emphasis) 55%,var(--pulse-foreground));--cat-eye:var(--pulse-background);--cat-whisker:color-mix(in srgb,var(--pulse-accent) 32%,var(--pulse-foreground));--cat-tip:var(--pulse-emphasis);--cat-tint:color-mix(in srgb,var(--pulse-accent) 15%,transparent)}
      :host([data-pulse-theme="light"]){--cat-shade:color-mix(in srgb,var(--pulse-accent) 72%,var(--pulse-foreground));--cat-light:color-mix(in srgb,var(--pulse-accent) 16%,#fff);--cat-outline:color-mix(in srgb,var(--pulse-accent) 28%,var(--pulse-foreground));--cat-eye:var(--pulse-foreground);--cat-whisker:color-mix(in srgb,var(--pulse-accent) 38%,var(--pulse-foreground));--cat-tint:color-mix(in srgb,var(--pulse-accent) 12%,transparent)}
      svg.cat-badge{width:16px;height:10px;fill:none;stroke:none;stroke-width:0;overflow:visible}svg.dashboard-speed-trail{display:block;width:140px;height:54px;flex:0 1 140px;max-width:48%;fill:none;stroke:none;stroke-width:0;overflow:visible}
      .dashboard-cat rect,.dashboard-cat path,.dashboard-speed-line,.dashboard-speed-area{shape-rendering:crispEdges}
      .speed-stop-start{stop-color:color-mix(in srgb,var(--pulse-accent) 42%,var(--pulse-muted))}.speed-stop-mid{stop-color:var(--pulse-accent)}.speed-stop-end{stop-color:var(--pulse-emphasis)}
      .dashboard-speed-base{stroke:var(--pulse-border);stroke-width:1}.dashboard-speed-peak{stroke:var(--pulse-muted);stroke-width:1;stroke-dasharray:2 2;opacity:.55}.dashboard-speed-line{fill:none;stroke:url(#ag-pulse-prism);stroke-width:2;stroke-linecap:butt;stroke-linejoin:miter}.dashboard-speed-area{fill:var(--cat-tint);stroke:none}
      .dashboard-cat-body{fill:var(--cat)}.dashboard-cat-shade{fill:var(--cat-shade)}.dashboard-cat-light{fill:var(--cat-light)}.dashboard-cat-outline{fill:var(--cat-outline)}.dashboard-cat-pink{fill:var(--cat-pink)}.dashboard-cat-eye{fill:var(--cat-eye)}.dashboard-cat-hl{fill:#fff}.dashboard-cat-whisker{fill:var(--cat-whisker)}.dashboard-cat-tip{fill:var(--cat-tip)}
      .dashboard-cat-badge-eyes rect{transform-box:fill-box;transform-origin:center}.cat-mood-sleep .dashboard-cat-badge-eyes rect{transform:scaleY(.5)}
      .dashboard-cat-frame{opacity:0}.dashboard-clawd-streaks line{stroke-width:1.2;stroke-linecap:round}.dashboard-cat .dashboard-clawd-streaks line:nth-child(1){stroke:var(--pulse-emphasis)}.dashboard-cat .dashboard-clawd-streaks line:nth-child(2){stroke:var(--pulse-accent)}.dashboard-cat .dashboard-clawd-streaks line:nth-child(3){stroke:var(--pulse-warning)}.cat-tone-cyan{fill:var(--pulse-emphasis)}.cat-tone-pink{fill:var(--pulse-accent)}.dashboard-cat-sparkle-core{fill:var(--pulse-warning)}
      #speed-card:not([hidden]) .cat-mood-run{--cat-cycle:calc(var(--clawd-stride,.36s) * 3)}#speed-card:not([hidden]) .cat-mood-dash{--cat-cycle:calc(var(--clawd-stride,.24s) * 1.5)}#speed-card:not([hidden]) .cat-mood-sleep{--cat-cycle:3.2s}
      @media(prefers-reduced-motion:reduce){.cat-mood-idle .cat-pose-upright,.dashboard-cat:not(.cat-mood-idle) .cat-first{opacity:1}}
      @media(prefers-reduced-motion:no-preference){
        .bar [data-card=speed]:is(:hover,[aria-expanded=true],[data-running=true]) .dashboard-cat:not(.cat-mood-sleep) .dashboard-cat-badge-eyes rect,#speed-card:not([hidden]) .dashboard-cat:not(.cat-mood-sleep) .dashboard-cat-badge-eyes rect{animation:cat-badge-blink 4.2s steps(1) infinite}
        #speed-card:not([hidden]) .cat-mood-run .dashboard-cat-frame{animation:cat-frame-8 var(--cat-cycle) step-end infinite}
        #speed-card:not([hidden]) .cat-mood-dash .dashboard-cat-frame{animation:cat-frame-6 var(--cat-cycle) step-end infinite}
        #speed-card:not([hidden]) .cat-mood-sleep .dashboard-cat-frame{animation:cat-frame-2 var(--cat-cycle) step-end infinite}
        #speed-card:not([hidden]) .cat-mood-idle .dashboard-cat-frame{animation:7s step-end infinite}
        #speed-card:not([hidden]) .cat-pose-upright{animation-name:cat-upright!important}#speed-card:not([hidden]) .cat-pose-blink{animation-name:cat-blink!important}#speed-card:not([hidden]) .cat-pose-tilting{animation-name:cat-tilting!important}#speed-card:not([hidden]) .cat-pose-tilted{animation-name:cat-tilted!important}#speed-card:not([hidden]) .cat-pose-tiltedBlink{animation-name:cat-tilted-blink!important}
        #speed-card:not([hidden]) .dashboard-clawd-streaks line{animation:cat-streak calc(var(--clawd-stride,.24s) * 1.4) linear infinite}
        #speed-card:not([hidden]) .dashboard-cat-sparkle{animation:cat-sparkle 2.6s ease-in-out infinite}
      }
      @keyframes cat-frame-8{0%{opacity:1}12.5%,100%{opacity:0}}@keyframes cat-frame-6{0%{opacity:1}16.667%,100%{opacity:0}}@keyframes cat-frame-2{0%{opacity:1}50%,100%{opacity:0}}
      @keyframes cat-upright{0%,19%,67.857%,81.857%{opacity:1}17.143%,31.429%,80%{opacity:0}}@keyframes cat-blink{17.143%,80%{opacity:1}0%,19%,81.857%{opacity:0}}@keyframes cat-tilting{31.429%,65.714%{opacity:1}0%,33.571%,67.857%{opacity:0}}@keyframes cat-tilted{33.571%,50.286%{opacity:1}0%,48.571%,65.714%{opacity:0}}@keyframes cat-tilted-blink{48.571%{opacity:1}0%,50.286%{opacity:0}}
      @keyframes cat-badge-blink{0%,93%{transform:none}94%,97%{transform:scaleY(.2)}}@keyframes cat-streak{from{transform:translateX(3px);opacity:1}to{transform:translateX(-5px);opacity:0}}@keyframes cat-sparkle{0%{transform:translate(0,0);opacity:0}30%{opacity:1}100%{transform:translate(4px,-8px);opacity:0}}
      .heading.speed-hero{align-items:flex-end;gap:10px;padding-bottom:9px;margin-bottom:0;font-weight:400}.heading.speed-hero span{display:inline}.speed-hero-main{min-width:0;flex:1 1 auto}.speed-hero-label{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--pulse-muted)}.speed-hero-rate{display:flex;align-items:baseline;gap:4px;margin-top:3px;white-space:nowrap;line-height:1.1}#latest-rate{font-size:24px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--pulse-foreground)}#latest-rate[data-status=true]{font-size:15px;letter-spacing:0}#latest-rate[data-rate-state=buffered]{color:var(--pulse-warning)}.speed-hero-rate-wrap{min-width:0}.speed-hero-sub{margin-top:2px;font-size:10.5px;line-height:1.3;color:var(--pulse-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}.speed-hero-sub[hidden]{display:none!important}
      dl.stats-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding-top:9px}#speed-card .speed-stats{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:7px}.ttft-latest{color:var(--pulse-muted);font-weight:400}dl.stats-grid>div{display:block;margin:0;min-width:0}dl.stats-grid dt{font-size:11px;color:var(--pulse-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}dl.stats-grid dd{margin:0;font-size:12px;text-align:left;white-space:nowrap;color:var(--pulse-foreground);overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}dl.stats-grid strong{font-weight:600}
      dl.stats-grid>.span-row{grid-column:1 / -1;display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding-top:6px;border-top:1px solid var(--pulse-separator)}dl.stats-grid>.span-row[hidden]{display:none}dl.stats-grid>.span-row dt{margin:0}dl.stats-grid>.span-row dd{text-align:right}
      .speed-unit{font-size:11px;font-weight:400;color:var(--pulse-muted)}.speed-unit[hidden]{display:none!important}
      .speed-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--pulse-separator);font-size:11px;color:var(--pulse-muted);font-variant-numeric:tabular-nums}.speed-meta span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .speed-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px;font-size:11px;color:var(--pulse-muted);font-variant-numeric:tabular-nums}#speed-basis-tag{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#speed-basis-tag:empty{display:none}#samples{flex:none;white-space:nowrap;margin-left:auto}
      .heading.cache-hero{display:block;padding-bottom:9px;margin-bottom:0}.cache-hero-main{display:flex;flex-direction:column;gap:3px}.cache-hero-value{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px 8px;line-height:1.1}.cache-hero-total{display:inline-flex;align-items:baseline;gap:5px;min-width:0}#cache-coverage{font-size:21px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--pulse-foreground)}#cache-coverage-unit{font-size:12px;font-weight:500}.rate-pill{display:inline-flex;align-items:center;gap:3px;flex:none;margin-left:auto;white-space:nowrap;padding:2px 6px;border-radius:5px;font-size:11px;font-weight:600;color:var(--pulse-accent);background:color-mix(in srgb,var(--pulse-accent) 14%,transparent);font-variant-numeric:tabular-nums}.rate-pill-label{font-weight:500}
      .cache-meter{display:flex;gap:2px;height:4px;border-radius:999px;background:var(--pulse-track);overflow:hidden;margin-top:8px}.cache-meter i{display:block;height:100%;width:0;min-width:0}#cache-seg-read{background:var(--pulse-accent)}#cache-seg-miss{background:color-mix(in srgb,var(--pulse-emphasis) 42%,var(--pulse-track))}#cache-seg-out{background:var(--pulse-muted);opacity:.55}
      #usage-entry{display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:9px;margin-top:10px;border-top:1px solid var(--pulse-separator)}#usage-entry[hidden]{display:none}
      .usage-summary{display:flex;align-items:baseline;gap:10px;min-width:0;flex:1 1 auto}.usage-summary>div{min-width:0}.usage-label{font-size:11px;line-height:1.25;color:var(--pulse-muted);white-space:nowrap}.usage-val{display:flex;align-items:baseline;gap:2px;white-space:nowrap;line-height:1.3}.usage-summary strong{font-size:13px;font-weight:600;color:var(--pulse-foreground);font-variant-numeric:tabular-nums}.usage-unit{font-size:11px;color:var(--pulse-muted)}
      #open-usage{display:inline-flex;align-items:center;gap:4px;flex:none;padding:4px 6px;border:0;border-radius:5px;background:transparent;color:var(--pulse-accent);font:inherit;font-size:11px;font-weight:550;white-space:nowrap;transition:background-color 120ms ease,transform 120ms ease}#open-usage:hover{background:var(--pulse-hover)}#open-usage:active{transform:scale(.98)}#open-usage svg{width:12px;height:12px;flex:none}
      .heading.context-hero{padding-bottom:6px;margin-bottom:6px;border-bottom:0}.context-hero-row{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px 8px;min-width:0}.context-hero-meta{display:inline-flex;align-items:baseline;justify-content:flex-end;flex-wrap:wrap;gap:4px 6px;min-width:0;max-width:100%;margin-left:auto}.context-submeta-row{display:flex;align-items:center;flex-wrap:wrap;gap:5px 6px;margin-top:6px;min-width:0}.context-submeta-row + .track{margin-top:8px}.context-submeta-row[hidden]{display:none}.context-rounds-pill,.context-compact-btn,.context-compaction-pill,.context-bloat-pill{padding:3px 7px;border-radius:6px;background:var(--pulse-control);font-size:10.5px;line-height:15px;color:var(--pulse-label);font-variant-numeric:tabular-nums;white-space:nowrap}.context-rounds-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;font-size:11px;line-height:15px;background:var(--pulse-background);border:1px solid var(--pulse-border);color:var(--pulse-foreground);font-weight:500;cursor:pointer;transition:background-color 140ms ease,border-color 140ms ease}.context-compact-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid transparent;font-weight:500;cursor:pointer;transition:background-color 140ms ease,border-color 140ms ease,color 140ms ease,opacity 140ms ease}.context-rounds-pill:hover{background:var(--pulse-hover)}.context-compact-btn:hover:not(:disabled){background:var(--pulse-hover);color:var(--pulse-foreground);border-color:var(--pulse-border)}.context-compact-btn:disabled{opacity:.55;cursor:default}.context-compact-btn[data-compacting=true]{color:var(--pulse-accent);background:color-mix(in srgb,var(--pulse-accent) 10%,var(--pulse-control));border-color:color-mix(in srgb,var(--pulse-accent) 32%,transparent)}.context-compact-btn[hidden]{display:none}.context-rounds-pill[aria-expanded=true]{border-color:var(--pulse-border);background:var(--pulse-control)}.context-rounds-pill:disabled{border-color:transparent;background:var(--pulse-control);cursor:default}.rounds-pill-chevron{width:10px;height:10px;stroke-width:1.6;color:var(--pulse-muted);transition:transform 150ms ease,color 150ms ease}.context-rounds-pill[aria-expanded=true] .rounds-pill-chevron{transform:rotate(180deg);color:var(--pulse-foreground)}.context-rounds-pill:disabled .rounds-pill-chevron{display:none}.context-bloat-pill{color:var(--pulse-warning);background:color-mix(in srgb,var(--pulse-warning) 14%,transparent);font-weight:600}.context-bloat-pill[data-critical=true]{color:var(--pulse-danger);background:color-mix(in srgb,var(--pulse-danger) 14%,transparent)}.context-rounds-pill[hidden],.context-compaction-pill[hidden],.context-bloat-pill[hidden]{display:none}#context-summary{font-size:20px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap;flex:0 0 auto}#context-tokens{font-size:11px;color:var(--pulse-muted);font-variant-numeric:tabular-nums;white-space:nowrap}@media(prefers-reduced-motion:no-preference){#context-ring[data-compacting=true]{animation:speed-dot-breathe 1.4s ease-in-out infinite}}
      .steps-drawer{margin-top:7px;padding:7px 8px;border:1px solid var(--pulse-separator);border-radius:7px;background:var(--pulse-background);display:grid;gap:6px;font-size:10px}.steps-drawer[hidden]{display:none}.steps-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:6px;color:var(--pulse-label);font-weight:600;font-variant-numeric:tabular-nums}.steps-drawer-sub{font-weight:400;color:var(--pulse-muted)}.steps-bar{display:flex;gap:1px;height:5px;border-radius:999px;overflow:hidden;background:var(--pulse-track)}.steps-bar i{display:block;height:100%;min-width:0}.steps-chips{display:flex;flex-wrap:wrap;gap:4px}.steps-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;background:var(--pulse-control);color:var(--pulse-label);font-variant-numeric:tabular-nums}.steps-chip strong{color:var(--pulse-foreground);font-weight:600}.steps-dot{width:6px;height:6px;border-radius:50%;flex:none}.steps-seg-tool{background:var(--pulse-muted)}.steps-seg-planner{background:var(--pulse-accent)}.steps-seg-user{background:var(--pulse-success)}.steps-seg-compaction{background:var(--pulse-warning)}.steps-seg-other{background:color-mix(in srgb,var(--pulse-ring) 65%,transparent)}
      .breakdown-details{margin-top:8px;padding-top:7px;border-top:1px solid var(--pulse-separator);font-size:11px;min-width:0}.breakdown-details[hidden]{display:none}.breakdown-details>summary{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;color:var(--pulse-label);font-weight:500;list-style:none;min-width:0}.breakdown-details>summary>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.breakdown-details>summary::-webkit-details-marker{display:none}.breakdown-meta{font-variant-numeric:tabular-nums;color:var(--pulse-muted);font-weight:500;font-size:10px;white-space:nowrap;flex:0 0 auto}.breakdown-body{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;margin-top:7px;font-variant-numeric:tabular-nums;min-width:0}.breakdown-chips{display:flex;flex-wrap:wrap;gap:4px;min-width:0}.breakdown-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:5px;background:var(--pulse-control);color:var(--pulse-label);font-size:10px}.breakdown-chip strong{color:var(--pulse-foreground);font-weight:600}.breakdown-section{display:grid;grid-template-columns:minmax(0,1fr);gap:3px;min-width:0}.breakdown-head{font-size:10px;color:var(--pulse-muted);font-weight:600}.breakdown-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11px;line-height:1.35;min-width:0}.breakdown-row-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--pulse-label)}.breakdown-row-val{flex:0 0 auto;color:var(--pulse-foreground);white-space:nowrap;font-variant-numeric:tabular-nums}.breakdown-row-warn{color:var(--pulse-warning);font-weight:550}.breakdown-row-warn[data-critical=true]{color:var(--pulse-danger)}.mini-pill-btn{justify-self:start;padding:2px 8px;border:1px solid var(--pulse-separator);border-radius:4px;background:var(--pulse-control);color:var(--pulse-label);font-size:10px;line-height:14px;white-space:nowrap;max-width:100%;cursor:pointer}.mini-pill-btn:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}.segmented-options{display:inline-flex;gap:2px;padding:2px;border-radius:6px;background:var(--pulse-control);flex:none}.segmented-button{border:0;background:none;font:inherit;font-size:11px;padding:2px 7px;margin:0;border-radius:4px;color:var(--pulse-muted);line-height:16px;cursor:pointer;white-space:nowrap;transition:background-color 140ms ease,color 140ms ease}.segmented-button:hover{color:var(--pulse-hover-text);background:var(--pulse-hover)}.segmented-button[aria-pressed=true]{color:var(--pulse-foreground);background:var(--pulse-hover);box-shadow:0 1px 2px var(--pulse-shadow)}.roster-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px 6px;margin-bottom:2px;min-width:0}.roster-filter .segmented-button{font-size:10px;line-height:14px;padding:2px 6px}.roster-list{display:grid;gap:6px;max-height:210px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--pulse-border) transparent;padding-right:2px;min-width:0}.roster-item{display:grid;gap:2px;padding-bottom:5px;border-bottom:1px solid var(--pulse-separator);min-width:0}.roster-item:last-child{border-bottom:0;padding-bottom:0}.roster-top{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;line-height:15px;min-width:0}.roster-left{display:inline-flex;align-items:center;gap:5px;min-width:0;flex:1 1 auto}.roster-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--pulse-success)}.roster-item.is-ended .roster-dot{background:var(--pulse-dot);opacity:.75}.roster-name{font-weight:600;color:var(--pulse-foreground);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.roster-item.is-ended .roster-name{color:var(--pulse-label);font-weight:500}.roster-ws{font-size:9px;line-height:12px;padding:0 4px;border-radius:3px;background:var(--pulse-control);color:var(--pulse-muted);flex:none;white-space:nowrap}.roster-tok{font-weight:600;color:var(--pulse-foreground);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}.roster-item.is-ended .roster-tok{color:var(--pulse-label);font-weight:500}.roster-sub{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-left:11px;font-size:10px;line-height:13px;color:var(--pulse-muted);font-variant-numeric:tabular-nums;min-width:0}.roster-model{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.roster-req{flex:none;white-space:nowrap}.roster-bar{height:2px;margin-left:11px;margin-top:2px;border-radius:999px;background:var(--pulse-track);overflow:hidden}.roster-bar>i{display:block;height:100%;border-radius:999px;background:var(--pulse-accent)}
      .context-composition{margin-top:8px}.context-composition[hidden]{display:none}.composition-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:11px;font-weight:500;color:var(--pulse-label)}.composition-title-wrap{display:inline-flex;align-items:baseline;gap:6px;min-width:0;flex-wrap:wrap}.composition-title-wrap .tag{font-weight:400;font-size:10px;color:var(--pulse-muted);white-space:nowrap;font-variant-numeric:tabular-nums}
      .composition-toggle{display:inline-flex;gap:2px;padding:2px;border-radius:6px;background:var(--pulse-control);flex:none}.composition-toggle-btn{border:0;background:none;font:inherit;font-size:10px;padding:2px 6px;margin:0;border-radius:4px;color:var(--pulse-muted);line-height:14px;cursor:pointer;transition:background-color 140ms ease,color 140ms ease}.composition-toggle-btn:hover{color:var(--pulse-hover-text);background:var(--pulse-hover)}.composition-toggle-btn[aria-pressed=true]{color:var(--pulse-foreground);background:var(--pulse-hover);box-shadow:0 1px 2px var(--pulse-shadow)}
      .composition-meter{display:flex;gap:1px;height:6px;border-radius:999px;overflow:hidden;margin-top:6px;background:var(--pulse-track)}.composition-meter i{display:block;height:100%;min-width:0}
      .composition-seg-customization,.composition-seg-group-rules,.composition-seg-rules{background:var(--pulse-emphasis)}.composition-seg-group-skills,.composition-seg-skills{background:color-mix(in srgb,var(--pulse-emphasis) 65%,var(--pulse-accent))}.composition-seg-group-subagents,.composition-seg-subagents{background:color-mix(in srgb,var(--pulse-ring) 80%,var(--pulse-emphasis))}.composition-seg-group-mcp,.composition-seg-mcpTools{background:color-mix(in srgb,var(--pulse-accent) 60%,var(--pulse-success))}.composition-seg-plugins{background:color-mix(in srgb,var(--pulse-emphasis) 55%,var(--pulse-accent))}.composition-seg-user,.composition-seg-chatMessages{background:var(--pulse-accent)}.composition-seg-thinking{background:var(--pulse-warning)}.composition-seg-reply{background:var(--pulse-success)}.composition-seg-assistant{background:var(--pulse-ring)}.composition-seg-tool,.composition-seg-tools{background:var(--pulse-muted)}.composition-seg-system,.composition-seg-systemPrompt{background:color-mix(in srgb,var(--pulse-muted) 45%,transparent)}.composition-seg-other{background:color-mix(in srgb,var(--pulse-accent) 28%,var(--pulse-track))}.composition-seg-remaining{background:var(--pulse-track)}
      .composition-list{display:flex;flex-direction:column;gap:5px;margin-top:8px}.composition-list[hidden]{display:none}.composition-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;line-height:1.35}.composition-row-label{display:inline-flex;align-items:center;gap:7px;color:var(--pulse-label);min-width:0}.composition-row-dot{width:7px;height:7px;border-radius:50%;flex:none}.composition-row-pct{font-variant-numeric:tabular-nums;color:var(--pulse-foreground);font-weight:500;white-space:nowrap}
      .composition-legend{display:flex;flex-wrap:wrap;gap:3px 8px;margin-top:6px;font-size:10px;line-height:1.3;color:var(--pulse-muted);font-variant-numeric:tabular-nums}.composition-legend[hidden]{display:none}.composition-legend-item{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.composition-legend-dot{width:6px;height:6px;border-radius:2px;flex:none}
      .context-cache-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--pulse-separator);font-size:11px;color:var(--pulse-muted)}.context-cache-row[hidden]{display:none}.context-cache-row strong{font-size:11px;font-weight:600;color:var(--pulse-foreground);font-variant-numeric:tabular-nums}
      .context-trend-section{margin-top:8px;padding-top:8px;border-top:1px solid var(--pulse-separator)}.context-trend-section[hidden]{display:none}.context-trend-section .composition-head{margin-top:0}
      #context-trend-svg{display:block;width:100%;height:36px;margin-top:6px}.trend-line{fill:none;stroke:var(--pulse-accent);stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}.trend-marker{stroke:var(--pulse-warning);stroke-width:1;stroke-dasharray:2 2}.trend-marker-hit{stroke:transparent;stroke-width:6}
      .heading.quota-hero{margin-bottom:0}.quota-actions{display:flex;align-items:center;gap:6px}
      .quota-details{margin-top:7px}.quota-section+.quota-section{margin-top:8px;padding-top:8px;border-top:1px solid var(--pulse-separator)}.quota-section[hidden]+.quota-section{margin-top:0;padding-top:0;border-top:0}
      .quota-row-top{display:flex;align-items:baseline;gap:6px;font-size:11px}.quota-name{display:inline-flex;align-items:center;gap:5px;color:var(--pulse-label);margin-right:auto;min-width:0}.quota-meta{display:inline-flex;align-items:baseline;gap:4px;font-size:11px;color:var(--pulse-muted);font-variant-numeric:tabular-nums;white-space:nowrap}.quota-row-top strong{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;flex:none}.quota-track{margin:6px 0 0}.quota-section .footnote{margin-top:5px}.quota-error{color:var(--pulse-warning);margin-top:7px}
      .card-language,.quota-display-row{position:relative;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px 8px;margin:10px 0 0;padding:8px 0 0;border-top:1px solid var(--pulse-separator);font-size:11px;color:var(--pulse-muted)}
      .card-footer-actions{display:inline-flex;align-items:center;gap:4px;margin-left:auto;flex:0 1 auto;max-width:100%;flex-wrap:wrap;justify-content:flex-end}
      .footer-repo-link{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:5px;color:var(--pulse-muted);text-decoration:none;cursor:pointer;flex:none;transition:background-color 120ms ease,color 120ms ease,transform 120ms ease}
      .footer-repo-link:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}.footer-repo-link:active{transform:scale(.97)}.footer-repo-link:focus-visible{outline:2px solid var(--pulse-accent);outline-offset:2px}
      .footer-repo-link svg{width:14px;height:14px;fill:currentColor;stroke:none;stroke-width:0;display:block}
      .language-options{display:flex;gap:2px;padding:2px;border-radius:6px;background:var(--pulse-control);flex:none}
      .language-options .language-button{border:0;background:none;font-size:11px;padding:2px 6px;margin:0;border-radius:4px;color:var(--pulse-muted);line-height:16px;cursor:pointer;transition:background-color 140ms ease,color 140ms ease,transform 120ms ease}
      .language-options .language-button:hover{color:var(--pulse-hover-text);background:var(--pulse-hover)}
      .language-options .language-button[aria-pressed=true]{color:var(--pulse-foreground);background:var(--pulse-hover);box-shadow:0 1px 2px var(--pulse-shadow)}
      .language-options .language-button:active{transform:scale(.97)}.language-button[data-save-failed=true]{color:var(--pulse-warning);text-decoration:underline dotted}
      .bar-customize-btn{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border:1px solid var(--pulse-border);border-radius:5px;background:var(--pulse-background);color:var(--pulse-label);font:inherit;font-size:10.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background-color 120ms ease,color 120ms ease,border-color 120ms ease}
      .bar-customize-btn:hover{background:var(--pulse-hover);color:var(--pulse-foreground);border-color:var(--pulse-accent)}
      .bar-migrate-note{margin:8px 0 0;padding:5px 7px;border-radius:6px;background:color-mix(in srgb,var(--pulse-warning) 12%,transparent);color:var(--pulse-label);font-size:10.5px;line-height:1.4}.bar-migrate-note[hidden]{display:none}
      .settings-dialog{position:fixed;inset:auto;margin:0;z-index:2147483000;border:1px solid var(--pulse-border);border-radius:12px;background:var(--pulse-card);color:var(--pulse-foreground);box-shadow:0 12px 36px rgba(0,0,0,.38);padding:0;max-width:calc(100vw - 24px);width:540px;max-height:min(76vh,540px);font:inherit;font-size:11.5px;overflow:hidden}.settings-dialog[hidden]{display:none}.settings-dialog::backdrop{background:transparent;pointer-events:none}
      :host([data-pulse-theme="light"]) .settings-dialog{box-shadow:0 10px 28px rgba(15,23,42,.14),0 2px 8px rgba(15,23,42,.08)}
      .settings-shell{display:grid;max-height:min(76vh,540px);grid-template-rows:auto minmax(0,1fr)}.settings-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid var(--pulse-separator);background:var(--pulse-card)}.settings-head-left{display:flex;align-items:center;gap:8px;min-width:0}.settings-back{display:inline-flex;align-items:center;gap:3px;height:22px;padding:0 7px;border:1px solid var(--pulse-border);border-radius:5px;background:var(--pulse-background);color:var(--pulse-label);font:inherit;font-size:10.5px;font-weight:500;cursor:pointer;white-space:nowrap;flex:none}.settings-back:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}.settings-title-wrap{min-width:0}.settings-title{font-size:12.5px;font-weight:600;color:var(--pulse-foreground);margin:0;line-height:1.25}.settings-sub{font-size:10.5px;color:var(--pulse-muted);margin-top:1px}.settings-head-actions{display:inline-flex;align-items:center;gap:8px;flex:none}
      .settings-close{width:24px;height:24px;border:0;border-radius:6px;background:var(--pulse-control);color:var(--pulse-label);font-size:15px;line-height:1;display:grid;place-items:center;cursor:pointer}.settings-close:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}
      .settings-body{padding:12px 16px 14px;overflow-y:auto;display:grid;gap:12px}
      .settings-section{display:grid;gap:7px}.settings-section+.settings-section{padding-top:10px;border-top:1px solid var(--pulse-separator)}.settings-sec-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;font-weight:600;color:var(--pulse-foreground)}
      .settings-cols{display:grid;grid-template-columns:minmax(156px,0.72fr) minmax(0,1.28fr);gap:12px}@media(max-width:520px){.settings-cols{grid-template-columns:1fr}}
      .bar-color-list{display:grid;gap:6px}.bar-color-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 7px;border-radius:7px;background:var(--pulse-background);border:1px solid var(--pulse-separator)}.bar-color-label{font-size:11px;font-weight:500;color:var(--pulse-foreground);white-space:nowrap}.bar-color-ctrls{display:inline-flex;align-items:center;gap:5px;flex:none}.bar-color-default{border:1px solid var(--pulse-separator);background:var(--pulse-control);color:var(--pulse-muted);border-radius:5px;padding:2px 6px;font:inherit;font-size:10.5px;line-height:14px;cursor:pointer;transition:border-color 120ms ease,background-color 120ms ease,color 120ms ease}.bar-color-default:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}.bar-color-default[aria-pressed=true]{border-color:var(--pulse-accent);color:var(--pulse-accent);background:color-mix(in srgb,var(--pulse-accent) 12%,var(--pulse-background));font-weight:600}.color-dot{width:14px;height:14px;padding:0;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--pulse-foreground) 22%,transparent);cursor:pointer;flex:none;transition:transform 120ms ease,box-shadow 120ms ease}.color-dot:hover{transform:scale(1.12)}.color-dot[aria-pressed=true]{box-shadow:0 0 0 2px var(--pulse-card),0 0 0 3.5px var(--pulse-foreground)}.color-picker-input{width:22px;height:18px;padding:0;border:1px solid var(--pulse-border);border-radius:5px;background:transparent;cursor:pointer}.color-picker-input::-webkit-color-swatch-wrapper{padding:1px}.color-picker-input::-webkit-color-swatch{border:0;border-radius:3px}
      .settings-tone-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding-top:2px;font-size:11px;color:var(--pulse-muted)}
      .settings-hint{margin:0;font-size:10px;line-height:1.4;color:var(--pulse-muted)}
      .settings-kv-list{display:grid;gap:7px}.settings-kv{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--pulse-muted);border-radius:7px;transition:background-color 300ms ease,box-shadow 300ms ease,color 200ms ease}.settings-kv>span{white-space:nowrap;flex-shrink:0}.settings-kv .language-options{flex:none}.settings-kv.is-highlight{padding:4px 6px;margin:-4px -6px;background:color-mix(in srgb,var(--pulse-accent) 16%,transparent);box-shadow:0 0 0 1.5px color-mix(in srgb,var(--pulse-accent) 70%,transparent);color:var(--pulse-foreground)}
      .bar-customize-reset{border:0;background:none;padding:0;color:var(--pulse-muted);font:inherit;font-size:10.5px;cursor:pointer}.bar-customize-reset:hover{color:var(--pulse-foreground);text-decoration:underline}
      .bar-customize-section{display:grid;gap:4px}.bar-customize-label{font-size:10.5px;color:var(--pulse-muted)}
      .bar-ctx-modes{display:grid;grid-template-columns:repeat(3,1fr)}.bar-ctx-modes .segmented-button{text-align:center;font-size:10.5px;padding:2px 4px}
      .bar-customize-list{display:grid;gap:4px}
      .bar-customize-row{display:flex;align-items:center;gap:6px;padding:4px 6px;border:1px solid var(--pulse-separator);border-radius:6px;background:var(--pulse-background);transition:opacity 120ms ease,border-color 120ms ease,background-color 120ms ease}
      .bar-customize-row.is-hidden{opacity:.55}.bar-customize-row.is-dragging,.chip.is-dragging{opacity:.4}.bar-customize-row.is-drag-over,.chip.is-drag-over{outline:1.5px solid var(--pulse-accent);outline-offset:-1px}
      .bar-drag-handle{color:var(--pulse-muted);font-size:11px;line-height:1;letter-spacing:-1px;user-select:none;cursor:grab}
      .bar-row-name{flex:1;min-width:0;color:var(--pulse-foreground);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .bar-move-btns{display:inline-flex;gap:2px}
      .bar-move-btn{width:18px;height:18px;padding:0;border:1px solid var(--pulse-separator);border-radius:4px;background:var(--pulse-card);color:var(--pulse-muted);font:inherit;font-size:10px;line-height:1;display:grid;place-items:center;cursor:pointer}.bar-move-btn:hover:not(:disabled){background:var(--pulse-hover);color:var(--pulse-foreground)}.bar-move-btn:disabled{opacity:.3;cursor:default}
      .bar-switch{position:relative;width:26px;height:15px;padding:0;border:0;border-radius:999px;background:var(--pulse-track);cursor:pointer;flex:none;transition:background-color 140ms ease}.bar-switch[aria-checked=true]{background:var(--pulse-accent)}.bar-switch:disabled{opacity:.45;cursor:not-allowed}.bar-switch::after{content:'';position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.22);transition:transform 140ms ease}.bar-switch[aria-checked=true]::after{transform:translateX(11px)}
      .language-guide{position:fixed;inset:auto;margin:0;padding:10px 12px;border:1px solid var(--pulse-border);border-radius:10px;background:var(--pulse-card);color:var(--pulse-foreground);box-shadow:0 4px 16px var(--pulse-shadow);font-size:11px;z-index:2147483000;overflow:visible}
      .language-guide[hidden]{display:none}.language-guide::backdrop{background:transparent;pointer-events:none}
      .language-guide::after{content:'';position:absolute;left:calc(var(--guide-anchor) - 4px);width:7px;height:7px;transform:rotate(45deg);background:var(--pulse-card);pointer-events:none}
      .language-guide[data-side=above]::after{bottom:-4px;border-right:1px solid var(--pulse-border);border-bottom:1px solid var(--pulse-border)}
      .language-guide[data-side=below]::after{top:-4px;border-left:1px solid var(--pulse-border);border-top:1px solid var(--pulse-border)}
      .guide-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:18px}
      .guide-heading strong{font-size:11px;font-weight:600}.guide-heading strong span{font-weight:400;color:var(--pulse-muted)}
      .language-guide button{border:0;background:transparent;color:var(--pulse-muted);border-radius:4px;cursor:pointer;font:inherit;transition:color 140ms ease,background-color 140ms ease,transform 120ms ease}
      .language-guide button:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}.language-guide button:active{transform:scale(.98)}
      #guide-close{font-size:15px;line-height:18px;width:20px;height:20px;margin:-3px -4px -3px 0;padding:0}
      #guide-open{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;width:calc(100% + 8px);margin:5px -4px -3px;padding:4px;line-height:16px}
      #guide-open>span{display:grid;gap:1px}#guide-open span[lang]{font-size:11px;color:var(--pulse-muted)}#guide-open svg{width:14px;height:14px;flex:none}
      #guide-save-note:empty,#language-save-note:empty{display:none}#guide-save-note,#language-save-note{color:var(--pulse-warning)}
      .heading.speed-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"label toggle" "rate trail";align-items:end;column-gap:10px;row-gap:2px}.speed-hero-main{display:contents}.speed-hero-label{grid-area:label;align-self:center}.speed-hero-rate-wrap{grid-area:rate;min-width:0}
      .heading.speed-hero svg.dashboard-speed-trail{grid-area:trail;justify-self:end;width:120px;height:46px;max-width:none;flex:none}
      .style-toggle{grid-area:toggle;justify-self:end;align-self:center;display:inline-flex;gap:1px;padding:2px;border-radius:6px;background:var(--pulse-control)}
      .style-toggle-button{display:grid;place-items:center;width:22px;height:18px;padding:0;margin:0;border:0;border-radius:4px;background:none;color:var(--pulse-muted);opacity:.7;cursor:pointer;transition:background-color 140ms ease,color 140ms ease,opacity 140ms ease,transform 120ms ease}
      .style-toggle-button:hover{opacity:1;color:var(--pulse-hover-text);background:var(--pulse-hover)}.style-toggle-button:active{transform:scale(.94)}
      .style-toggle-button[aria-pressed=true]{opacity:1;color:var(--pulse-foreground);background:var(--pulse-hover);box-shadow:0 1px 2px var(--pulse-shadow)}.style-toggle-button[data-save-failed=true]{color:var(--pulse-warning)}
      .style-toggle-button svg,.style-toggle-button svg.cat-badge{width:14px;height:9px;overflow:visible;fill:none}.style-toggle-button .speed-pulse-icon{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
      svg.cat-badge .speed-pulse-icon{fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
      .speed-min-base{stroke:var(--pulse-separator);stroke-width:1}.speed-min-area{fill:color-mix(in srgb,var(--pulse-accent) 14%,transparent);stroke:none}.speed-min-line{fill:none;stroke:var(--pulse-accent);stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}.speed-min-dot{fill:var(--pulse-accent);stroke:var(--pulse-card);stroke-width:1}
      :host([data-speed-style=minimal]) .speed-hero-label{gap:6px;font-size:12px;color:var(--pulse-label)}:host([data-speed-style=minimal]) .speed-hero-rate{gap:6px;margin-top:4px}
      :host([data-speed-style=minimal]) #latest-rate{font-size:28px;font-weight:500;letter-spacing:-.03em}:host([data-speed-style=minimal]) #latest-rate[data-status=true]{font-size:15px;letter-spacing:0}:host([data-speed-style=minimal]) #latest-unit{font-size:12px}
      :host([data-speed-style=minimal]) #speed-card dl.stats-grid dd{font-size:13px}:host([data-speed-style=minimal]) #speed-card dl.stats-grid strong{font-weight:500}
      @media(prefers-reduced-motion:no-preference){#speed-card:not([hidden]) .speed-min-dot.is-live{animation:speed-dot-breathe 1.8s ease-in-out infinite}}
      @keyframes speed-dot-breathe{0%,100%{opacity:1}50%{opacity:.4}}
    </style><div class="bar" data-i18n-aria="strip" aria-label="Dashboard statistics">
      <button type="button" class="strip-toggle" id="strip-toggle" aria-expanded="true" aria-label="Collapse to minimal bar" title="Collapse to minimal bar"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5"/></svg></button>
      <span class="dot" id="dot" title="Connecting"></span>
      <button class="chip" data-card="speed" data-i18n-aria="session" aria-controls="speed-card" aria-expanded="false"><svg class="cat-badge" id="strip-cat-badge" viewBox="0 0 16 10" aria-hidden="true"></svg><span class="rounds dim" id="rounds"></span><strong id="tps">—</strong><span>tok/s</span></button>
      <button class="chip" data-card="cache" data-i18n-aria="panelCache" aria-controls="cache-card" aria-expanded="false">${svg('cache')}<svg class="collection-warning" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 15 14H1ZM8 6v4m0 2v.1"/></svg><svg class="collection-processing" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5M8 1v3m3-2v3"/></svg><span class="collection-label"></span><span class="cache-total" id="cache-total"><span id="cache-total-num">—</span><span class="cache-unit"> tok</span></span><span class="cache-hit" id="cache-hit" hidden></span></button>
      <button class="chip" data-card="quota" data-i18n-aria="quotaRingTitle" aria-controls="quota-card" aria-expanded="false"><svg class="quota-ring" viewBox="0 0 20 20" aria-hidden="true"><circle class="ring-track" cx="10" cy="10" r="8"/><circle class="ring-arc" id="quota-ring-arc" cx="10" cy="10" r="8" transform="rotate(-90 10 10)"/></svg><span class="quota-text" id="quota-text">—</span></button>
      <button class="chip" data-card="context" data-i18n-aria="context" aria-controls="context-card" aria-expanded="false"><span class="context-ring" id="context-ring" aria-hidden="true"></span><span class="context-label" data-i18n="contextShort">Ctx</span><strong id="context-percent">—</strong><span class="context-rounds dim" id="context-rounds" hidden></span></button>
    </div><section class="card" id="speed-card" role="region" data-i18n-aria="session" aria-label="Session statistics" hidden>
      <div class="heading speed-hero" id="speed-hero"><div class="speed-hero-main"><div class="speed-hero-label"><svg class="cat-badge" id="card-cat-badge" viewBox="0 0 16 10" aria-hidden="true"></svg><span data-i18n="latestSpeed">${t('latestSpeed')}</span></div><div class="speed-hero-rate-wrap"><div class="speed-hero-rate"><strong id="latest-rate">—</strong><span class="speed-unit" id="latest-unit">tok/s</span></div><div class="speed-hero-sub" id="latest-sub" hidden></div></div></div><svg class="dashboard-speed-trail" id="speed-trail" viewBox="0 0 140 54" aria-hidden="true"></svg><div class="style-toggle" role="group" data-i18n-aria="speedStyle"><button type="button" class="style-toggle-button" id="speed-style-minimal" data-speed-style-choice="minimal"><svg viewBox="0 0 16 10" aria-hidden="true"><path class="speed-pulse-icon" d="M1 5h3l2-4 3 8 2-4h4"/></svg></button><button type="button" class="style-toggle-button" id="speed-style-cat" data-speed-style-choice="cat"><svg class="cat-badge" id="style-cat-icon" viewBox="0 0 16 10" aria-hidden="true"></svg></button></div></div>
      <dl class="stats-grid speed-stats"><div id="session-speed-cell"><dt data-i18n="sessionAvg">${t('sessionAvg')}</dt><dd><strong id="session-rate">—</strong><span class="speed-unit" id="session-unit"> tok/s</span></dd></div><div id="e2e-speed-cell"><dt data-i18n="e2eSpeed">${t('e2eSpeed')}</dt><dd><strong id="e2e-rate">—</strong><span class="speed-unit" id="e2e-unit"> tok/s</span></dd></div><div id="ttft-cell"><dt data-i18n="ttftShort">${t('ttftShort')}</dt><dd><strong id="ttft">—</strong><span class="speed-unit" id="ttft-unit"></span><span class="ttft-latest" id="ttft-latest"></span></dd></div><div id="peak-speed-cell"><dt data-i18n="peakSpeed">${t('peakSpeed')}</dt><dd><strong id="peak-rate">—</strong><span class="speed-unit" id="peak-unit"> tok/s</span></dd></div></dl>
      <div class="speed-meta" id="speed-meta"><span id="speed-times">—</span><span id="tokens">—</span></div>
      <div class="speed-foot" id="speed-foot"><span id="speed-basis-tag"></span><span id="samples">—</span></div>
    </section><section class="card" id="cache-card" role="region" data-i18n-aria="panelCache" aria-label="Token · Cache" hidden>
      <div class="heading cache-hero"><div class="cache-hero-main"><div class="hero-label">${svg('cache')}<span data-i18n="panelCache">Token · Cache</span></div><div class="cache-hero-value"><span class="cache-hero-total" id="cache-hero-total"><strong id="cache-coverage">—</strong><span class="speed-unit" id="cache-coverage-unit">toks</span></span><span class="rate-pill"><span class="rate-pill-label" data-i18n="cacheHitRateColon">${t('cacheHitRateColon')}</span><span id="cache-detail-rate">—</span></span></div></div><div class="cache-meter" aria-hidden="true"><i id="cache-seg-read"></i><i id="cache-seg-miss"></i><i id="cache-seg-out"></i></div></div>
      <dl class="stats-grid cache-stats">${[['cacheRead','cache-read'],['cacheMiss','cache-miss'],['cacheOutput','cache-output']].map(([key,id])=>`<div id="${id}-cell"><dt data-i18n="${key}">${t(key)}</dt><dd><strong id="${id}">—</strong><span class="speed-unit" id="${id}-unit" hidden> toks</span></dd></div>`).join('')}<div id="cache-write-row" class="span-row" hidden><dt data-i18n="cacheWrite">${t('cacheWrite')}</dt><dd id="cache-write">—</dd></div><div class="span-row" id="task-own-row" hidden><dt data-i18n="taskOwn">${t('taskOwn')}</dt><dd id="task-own">—</dd></div><div class="span-row" id="task-subagents-row" hidden><dt id="task-subagents-label"></dt><dd id="task-subagents">—</dd></div></dl><p class="footnote" id="cache-note" hidden></p>
      <details class="breakdown-details" id="orchestrator-breakdown" hidden><summary><span id="orch-phase-label"></span><strong class="breakdown-meta" id="orch-phase-meta"></strong></summary><div class="breakdown-body" id="orch-phase-body"></div></details>
      <details class="breakdown-details" id="orchestration-breakdown" hidden><summary><span id="orch-summary-label"></span><strong class="breakdown-meta" id="orch-summary-meta"></strong></summary><div class="breakdown-body" id="orch-body"></div></details>
    </section><section class="card quota-card" id="quota-card" role="region" data-i18n-aria="quotaRingTitle" hidden>
      <div class="heading quota-hero"><div class="quota-spotlight-head" id="active-quota-group"><i class="spot-dot" id="spot-dot" aria-hidden="true"></i><strong class="spot-name" id="active-group-name">—</strong></div><div class="quota-actions"><span class="refresh quota-spinner" id="quota-spinner" role="status" data-i18n-aria="refreshing" aria-label="Refreshing…" aria-busy="false" hidden><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12.8 6a5.1 5.1 0 1 0 .1 4M12.8 2.5V6H9.2"/></svg></span><span class="pace-badge" id="quota-pace" hidden><i class="pace-dot" aria-hidden="true"></i><span id="quota-pace-text"></span></span></div></div>
      <div class="quota-details">${['five','week'].map(name=>`<section class="quota-section" id="${name}-quota-section" data-i18n-aria="${name}" aria-label="${t(name)}"><div class="quota-row-top"><span class="quota-name">${svg(name)}<span id="${name}-quota-title" data-i18n="${name}">${t(name)}</span></span><span class="quota-meta"><span class="reset" id="${name}-countdown">—</span></span><strong id="${name}-balance">—</strong></div><div class="track quota-track" role="progressbar" data-i18n-aria="${name}" id="${name}-track"><i class="track-actual" id="${name}-fill"></i></div><div class="quota-forecast" id="${name}-forecast" hidden><span class="forecast-main" id="${name}-forecast-text"></span><span class="usage-hint" id="${name}-usage" hidden></span></div><p class="footnote" id="${name}-note" hidden></p></section>`).join('')}</div>
      <p class="footnote quota-error" id="quota-error" hidden></p>
      <div class="quota-siblings" id="quota-siblings" hidden></div>
    </section><section class="card context-card" id="context-card" role="region" data-i18n-aria="context" hidden>
      <div class="heading context-hero"><span class="hero-label">${svg('context')}<span data-i18n="context">Context window</span><span class="tag" id="remote-connected-tag" hidden></span></span><span class="tag" id="context-model">—</span></div>
      <div class="context-hero-row"><strong id="context-summary">—</strong><span class="context-hero-meta"><span id="context-tokens">—</span></span></div>
      <div class="context-submeta-row" id="context-submeta-row" hidden><button type="button" class="tag context-rounds-pill" id="context-rounds-pill" aria-expanded="false" aria-controls="context-steps-drawer" hidden><span id="context-rounds-pill-text"></span><svg class="rounds-pill-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3"/></svg></button><button type="button" class="tag context-compact-btn" id="context-compact-btn" hidden><svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 2.75 6 5.25 8.5 2.75M3.5 9.25 6 6.75 8.5 9.25"/></svg><span id="context-compact-btn-text"></span></button><span class="tag context-compaction-pill" id="context-compaction-pill" hidden></span><span class="tag context-bloat-pill" id="context-bloat-pill" hidden></span></div>
      <div class="steps-drawer" id="context-steps-drawer" hidden></div>
      <div class="track" role="progressbar" data-i18n-aria="context" id="context-track"><i id="context-fill"></i></div>
      <section class="context-composition" id="context-composition" hidden><div class="composition-meter" id="composition-meter" aria-hidden="true"></div><div class="composition-head"><span class="composition-title-wrap"><span data-i18n="compositionTitle">Context composition</span><span class="tag" id="composition-source"></span></span><div class="composition-toggle" role="group" data-i18n-aria="compositionViewToggle"><button type="button" class="composition-toggle-btn" data-composition-view="list" data-i18n="compositionViewList">List</button><button type="button" class="composition-toggle-btn" data-composition-view="bar" data-i18n="compositionViewBar">Bar</button></div></div><div class="composition-list" id="composition-list"></div><div class="composition-legend" id="composition-legend" hidden></div></section>
      <div class="context-cache-row" id="context-cache-row" hidden><span data-i18n="avgCacheHitRate">Avg cache hit rate</span><strong id="context-cache-rate">—</strong></div>
      <section class="context-trend-section" id="context-trend-section" hidden><div class="composition-head"><span data-i18n="trendTitle">Context trend</span><span class="tag" id="trend-sample"></span></div><svg id="context-trend-svg" viewBox="0 0 280 36" preserveAspectRatio="none" aria-hidden="true"></svg></section>
      <details class="breakdown-details" id="context-breakdown" hidden><summary><span id="ctx-breakdown-label"></span><strong class="breakdown-meta" id="ctx-breakdown-meta"></strong></summary><div class="breakdown-body" id="ctx-breakdown-body"></div></details>
    </section>`);
    targetParent.insertBefore(node,targetAnchor.nextSibling);
    attribute(node,'data-speed-style',speedStyle.style);paintSpeed([],'idle',0.36,false);updateCatBadge($('style-cat-icon'),'idle');
    for(const cardId of ['speed-card','cache-card','context-card']){const card=$(cardId);if(!card)continue;const note=document.createElement('div');note.className='scope-note';note.dataset.i18n='subagentStats';card.querySelector('.heading').after(note);}
    for(const cardId of ['speed-card','cache-card','context-card']){
      const card=$(cardId);if(!card)continue;
      const notice=document.createElement('section');notice.className='collection-notice';notice.hidden=true;
      setMarkup(notice,'<strong class="collection-state"></strong><div data-i18n="collectionReason"></div><details><summary data-i18n="collectionDetails"></summary><div class="collection-budget-kind"></div><div class="collection-budget-size"></div><div data-i18n="collectionNoPartial"></div></details>');
      const docs=document.createElement('a');docs.href='https://github.com/wycocoyu/agy-context-dashboard/blob/main/docs/LONG_CONVERSATIONS.md';docs.target='_blank';docs.rel='noopener noreferrer';docs.dataset.i18n='collectionDocs';notice.querySelector('details').append(docs);
      card.querySelector('.heading').after(notice);
      notice.querySelector('details').addEventListener('toggle',()=>{if(!disposed)position();});
    }
    remoteSessionNote=document.createElement('p');remoteSessionNote.className='bar-migrate-note';remoteSessionNote.id='remote-session-note';remoteSessionNote.hidden=true;
    $('quota-card').append(remoteSessionNote);
    languageRow=document.createElement('div');languageRow.className='card-language';
    setMarkup(languageRow,'<div class="language-options" role="group" data-i18n-aria="language"><button type="button" class="language-button" id="card-language-en" data-language-choice="en" aria-label="English">EN</button><button type="button" class="language-button" id="card-language-zh" data-language-choice="zh-CN" aria-label="简体中文">简</button><button type="button" class="language-button" id="card-language-zh-tw" data-language-choice="zh-TW" aria-label="繁體中文">繁</button></div><div class="card-footer-actions"></div>');
    const footerActions=languageRow.querySelector('.card-footer-actions');
    const stripModeGroup=document.createElement('div');stripModeGroup.className='strip-mode-options';stripModeGroup.setAttribute('role','group');stripModeGroup.dataset.i18nAria='stripMode';
    setMarkup(stripModeGroup,'<button type="button" class="strip-mode-button" id="strip-mode-full" data-strip-mode-choice="full"><svg viewBox="0 0 14 10" aria-hidden="true"><path d="M1 5h2.2M4.8 5h2.2"/><circle cx="11" cy="5" r="1.9"/></svg></button><button type="button" class="strip-mode-button" id="strip-mode-minimal" data-strip-mode-choice="minimal"><svg viewBox="0 0 14 10" aria-hidden="true"><circle cx="4.5" cy="5" r="2.1"/><path d="M8.6 5h3.8"/></svg></button>');
    footerActions.append(stripModeGroup);
    const settingsToggleBtn=document.createElement('button');settingsToggleBtn.type='button';settingsToggleBtn.className='bar-customize-btn';settingsToggleBtn.id='pulse-settings-toggle';settingsToggleBtn.setAttribute('data-open-pulse-settings','true');settingsToggleBtn.setAttribute('aria-haspopup','dialog');settingsToggleBtn.setAttribute('aria-controls','pulse-settings-dialog');
    setMarkup(settingsToggleBtn,'<span aria-hidden="true">⚙</span><span data-i18n="pulseSettings"></span>');
    footerActions.append(settingsToggleBtn);
    const repoLink=document.createElement('a');repoLink.className='footer-repo-link';repoLink.id='github-repo-link';repoLink.href='https://github.com/wycocoyu/agy-context-dashboard';repoLink.target='_blank';repoLink.rel='noopener noreferrer';repoLink.setAttribute('aria-label','GitHub');repoLink.title='GitHub';
    setMarkup(repoLink,'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>');
    footerActions.append(repoLink);
    $('context-card').append(languageRow);
    if(window.__agPulseUpdateFactory&&window.agPulseHost.updatePlugin)updateMenu=window.__agPulseUpdateFactory({root,row:footerActions,language,setMarkup,request:input=>window.agPulseHost.updatePlugin(input),onOpen:hide,onStateChange:()=>{if(!disposed&&!instDisposed)render();}});
    saveNote=document.createElement('p');saveNote.className='footnote';saveNote.id='language-save-note';languageRow.after(saveNote);
    settingsDialog=document.createElement('section');settingsDialog.className='settings-dialog';settingsDialog.id='pulse-settings-dialog';settingsDialog.hidden=true;settingsDialog.setAttribute('role','dialog');settingsDialog.setAttribute('aria-modal','false');settingsDialog.setAttribute('aria-labelledby','settings-dialog-title');
    setMarkup(settingsDialog,'<div class="settings-shell"><header class="settings-head"><div class="settings-head-left"><button type="button" class="settings-back" id="pulse-settings-back"><span>←</span><span data-i18n="settingsBack"></span></button><div class="settings-title-wrap"><h2 class="settings-title" id="settings-dialog-title" data-i18n="pulseSettingsTitle"></h2><div class="settings-sub" data-i18n="pulseSettingsSubtitle"></div></div></div><div class="settings-head-actions"><button type="button" class="bar-customize-reset" id="bar-customize-reset" data-i18n="barReset"></button><button type="button" class="settings-close" id="pulse-settings-close" data-i18n-aria="settingsClose">×</button></div></header><div class="settings-body" id="pulse-settings-body"></div></div>');
    root.append(settingsDialog);
    $('pulse-settings-back')?.addEventListener('click',()=>{closeSettingsModal({restoreFocus:false});show(footerHostCard());});
    $('pulse-settings-close')?.addEventListener('click',()=>closeSettingsModal());
    $('bar-customize-reset')?.addEventListener('click',()=>{
      void barPrefs.reset();
      void themeModePref.choose('auto');
      void barColorsPref.reset();
      void cacheHitTone.choose('accent');
      void cacheHitTiers.choose(false);
      void cacheChipMode.choose('both');
      void quotaDisplay.choose('both');
      void speedStyle.choose('minimal');
      void barPlacement.choose('inline');
    });
    const guide=document.createElement('section');guide.className='language-guide';guide.id='language-guide';guide.hidden=true;guide.setAttribute('role','region');guide.setAttribute('aria-label','Language / 語言 / 语言');
    setMarkup(guide,'<div class="guide-heading"><strong>Language <span>/ 语言</span></strong><button type="button" id="guide-close" aria-label="Dismiss language tip / 关闭语言提示" title="Dismiss / 关闭">×</button></div><button type="button" id="guide-open"><span><span>Switch in context details</span><span lang="zh-CN">在上下文详情中切换语言</span></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg></button><p class="footnote" id="guide-save-note"></p>');
    root.append(guide);
    $('guide-close').addEventListener('click',()=>void dismissGuide());
    $('guide-open').addEventListener('click',()=>{guideOpened=true;show('context');const btn=$(language.language==='zh-TW'?'card-language-zh-tw':'card-language-zh');btn.scrollIntoView({block:'nearest'});btn.focus({preventScroll:true});});
    // Escape ancestor stacking/paint contexts; ordinary z-index cannot do this.
    if(typeof HTMLElement.prototype.showPopover==='function')for(const card of root.querySelectorAll('.card'))card.setAttribute('popover','manual');
    if(typeof settingsDialog.showPopover==='function')settingsDialog.setAttribute('popover','manual');
    if(typeof guide.showPopover==='function')guide.setAttribute('popover','manual');
    themeController=theme.attach(node,{embedded:true,onChange:()=>{if(!disposed&&!instDisposed){if(settingsOpen)renderSettingsModal();scheduleLayout();}}});
    themeController.setThemeMode?.(themeModePref.value);
    themeController.setBarColors?.(barColorsPref.colors);
    attribute(node,'data-cache-hit-tone',cacheHitTone.value);
    attribute(node,'data-cache-hit-tiers',cacheHitTiers.enabled?'true':'false');
    report('mounted',{editorFound:true,composerFound:true});
    observeComposer();
    for(const chip of root.querySelectorAll('[data-card]')){
      const id=chip.dataset.card;
      chip.draggable=true;
      chip.addEventListener('pointerenter',()=>hoverChip(id));chip.addEventListener('pointerleave',leaveChip);chip.addEventListener('focus',()=>{if(chip.matches(':focus-visible'))show(id);});chip.addEventListener('click',()=>show(id));
      chip.addEventListener('dragstart',e=>{draggingChipId=id;chip.classList.add('is-dragging');try{e.dataTransfer?.setData('text/plain',id);}catch{}});
      chip.addEventListener('dragend',()=>{draggingChipId=null;for(const c of root?.querySelectorAll('.chip,.bar-customize-row')||[])c.classList.remove('is-dragging','is-drag-over');});
      chip.addEventListener('dragover',e=>{if(!draggingChipId||draggingChipId===id)return;e.preventDefault();chip.classList.add('is-drag-over');});
      chip.addEventListener('dragleave',()=>chip.classList.remove('is-drag-over'));
      chip.addEventListener('drop',e=>{e.preventDefault();chip.classList.remove('is-drag-over');if(draggingChipId)reorderChips(draggingChipId,id);});
    }
    for(const card of root.querySelectorAll('.card')){
      card.addEventListener('pointerenter',()=>clearTimeout(hoverTimer));card.addEventListener('pointerleave',scheduleHide);
    }
    // A host composer may focus its editor on bubbled clicks. Keep plugin
    // controls' mouse actions inside the shadow root while retaining their
    // default focus/click behavior and document-level outside-click dismissal.
    for(const type of ['pointerdown','mousedown','click'])root.addEventListener(type,event=>event.stopPropagation());
    node.addEventListener('pointerenter',()=>clearTimeout(hoverTimer));node.addEventListener('pointerleave',scheduleHide);
    root.addEventListener('focusout',()=>setTimeout(()=>{if(Date.now()>=ignoreLeaveUntil&&!cardEngaged())hide();},0));
    $('strip-toggle')?.addEventListener('click',()=>{hide();void stripMode.choose(stripMode.mode==='minimal'?'full':'minimal');});
    for(const button of root.querySelectorAll('[data-strip-mode-choice]'))button.addEventListener('click',()=>void stripMode.choose(button.dataset.stripModeChoice));
    for(const button of root.querySelectorAll('.refresh'))button.addEventListener('click',()=>refreshManually(false));
    for(const button of root.querySelectorAll('[data-open-pulse-settings]'))button.addEventListener('click',()=>openSettingsModal(button));
    for(const button of root.querySelectorAll('[data-language-choice]'))button.addEventListener('click',()=>void preferences.choose(button.dataset.languageChoice));
    for(const button of root.querySelectorAll('[data-speed-style-choice]'))button.addEventListener('click',()=>void speedStyle.choose(button.dataset.speedStyleChoice));
    for(const button of root.querySelectorAll('[data-composition-view]'))button.addEventListener('click',()=>setCompositionView(button.dataset.compositionView));
    $('context-rounds-pill')?.addEventListener('click',()=>{if(data?.speed?.stepBreakdown){stepsDrawerOpen=!stepsDrawerOpen;render();position();}});
    $('context-compact-btn')?.addEventListener('click',()=>triggerCompact());
    for(const d of root.querySelectorAll('.breakdown-details'))d.addEventListener('toggle',()=>{if(!disposed)position();});
    const cacheHitRow=document.createElement('div');cacheHitRow.className='quota-display-row';cacheHitRow.id='cache-inline-hit-row';
    setMarkup(cacheHitRow,'<span data-i18n="cacheChipMode"></span><div class="language-options" role="group" data-i18n-aria="cacheChipMode"><button type="button" class="language-button" id="cache-card-hit-off" data-cache-chip-mode="tokens" data-inline-cache-hit-choice="false" data-i18n="cacheChipModeTokens"></button><button type="button" class="language-button" id="cache-card-hit-on" data-cache-chip-mode="both" data-inline-cache-hit-choice="true" data-i18n="cacheChipModeBoth"></button><button type="button" class="language-button" id="cache-card-hit-only" data-cache-chip-mode="hit" data-i18n="cacheChipModeHit"></button></div>');
    $('cache-card').append(cacheHitRow);
    cacheHitRow.querySelectorAll('[data-cache-chip-mode]').forEach(btn=>btn.addEventListener('click',()=>void cacheChipMode.choose(btn.dataset.cacheChipMode)));
    if(window.__agPulseUsageFactory){
      const section=document.createElement('div');section.id='usage-entry';section.hidden=true;
      setMarkup(section,'<div class="usage-summary"><div><div class="usage-label" id="usage-today-label"></div><div class="usage-val"><strong id="usage-today"></strong><span class="usage-unit" id="usage-today-unit">toks</span></div></div><div><div class="usage-label" id="usage-month-label"></div><div class="usage-val"><strong id="usage-month"></strong><span class="usage-unit" id="usage-month-unit">toks</span></div></div></div><button type="button" id="open-usage"><span id="usage-open-label"></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg></button>');$('cache-card').append(section);
      usageDashboard=window.__agPulseUsageFactory({root,language,setMarkup,hostLabel:surface?.usageHostLabel||'Antigravity',guideDismissed:usageGuideDismissed,onDismissGuide:async()=>{const saved=await window.agPulseHost.setPreferences({usageGuideDismissed:true});if(saved?.usageGuideDismissed!==true)throw Error('Usage guide could not be saved');syncGuide(saved);},onLanguage:next=>preferences.choose(next),onRefresh:()=>refreshManually(true),onScope:async next=>{
        const ticket=++scopeRequestEpoch,save=usageScope.choose(next);
        try{
          const result=await window.agPulseHost.getMetrics({conversationId:null,force:false,usageOnly:true,usageScope:next});
          if(!disposed&&!instDisposed&&ticket===scopeRequestEpoch&&result?.usage){
            if(data)data={...data,usage:result.usage};
            text('usage-today',compact(result.usage.todayTokens));text('usage-today-unit',tokUnit(result.usage.todayTokens));
            text('usage-month',compact(result.usage.monthTokens));text('usage-month-unit',tokUnit(result.usage.monthTokens));
            usageDashboard?.update(result.usage);
          }
        }finally{await save;}
      }});
      root.getElementById('usage-dashboard')?.addEventListener('close',scheduleLayout);
      $('open-usage').addEventListener('click',()=>{const trigger=root.querySelector('[data-card=cache]'),conversation=conversationId(),model=currentComposerModel(),remoteHost=detectRemoteHost();for(const other of instances)other.hide();usageDashboard.open(data?.usage,trigger);void window.agPulseHost.getMetrics({conversationId:conversation,force:true,usageSync:true,...(model?{composerModel:model}:{}),...(remoteHost?{remoteHost}:{})}).then(result=>{if(!disposed&&!instDisposed&&result?.usage&&(!result.usage.scope||result.usage.scope===usageScope.scope)){if(data)data={...data,usage:result.usage};usageDashboard.update(result.usage);}}).catch(()=>{});});
    }
    lastConversation=conversationId();
    if(!lastConversation){hydrated=true;seenEmptySession=true;}
    applyBarLayout();
    localize();
    fit();position();
    refresh();
  }
  function reorderChips(fromId,toId){
    if(!fromId||!toId||fromId===toId)return;
    const next=barPrefs.order,a=next.indexOf(fromId),b=next.indexOf(toId);
    if(a<0||b<0)return;
    next.splice(a,1);next.splice(b,0,fromId);
    ignoreLeaveUntil=Date.now()+250;
    void barPrefs.update({barOrder:next});
  }
  function moveChip(id,delta){
    const next=barPrefs.order,idx=next.indexOf(id),to=idx+delta;
    if(idx<0||to<0||to>=next.length)return;
    [next[idx],next[to]]=[next[to],next[idx]];
    ignoreLeaveUntil=Date.now()+250;
    void barPrefs.update({barOrder:next});
  }
  function toggleChipVisible(id){
    const set=new Set(barPrefs.hidden);
    if(set.has(id))set.delete(id);
    else{
      if(barPrefs.order.length-set.size<=1)return;
      set.add(id);
    }
    ignoreLeaveUntil=Date.now()+250;
    void barPrefs.update({barHidden:barPrefs.order.filter(k=>set.has(k))});
  }
  function applyBarLayout(){
    if(!root)return;
    const order=barPrefs.order,remoteFallback=isRemoteFallback(),hiddenSet=effectiveHiddenSet();
    const sig=JSON.stringify([order,barPrefs.hidden,remoteFallback]);
    if(sig===lastBarLayoutSig)return;
    lastBarLayoutSig=sig;
    const bar=root.querySelector('.bar');
    if(bar){
      const current=Array.from(bar.querySelectorAll(':scope > [data-card]')).map(e=>e.dataset.card);
      if(current.length!==order.length||current.some((id,i)=>id!==order[i])){
        for(const id of order){const chip=bar.querySelector(`[data-card="${id}"]`);if(chip)bar.append(chip);}
      }
      for(const id of order){
        const chip=bar.querySelector(`[data-card="${id}"]`);
        if(chip&&id!=='quota')hidden(chip,hiddenSet.has(id));
      }
    }
    const host=footerHostCard();
    if(host!==lastFooterHost){
      lastFooterHost=host;
      const target=$(cardIdFor(host));
      if(target&&languageRow&&saveNote){
        target.append(languageRow,saveNote);
      }
    }
    if(cardName&&hiddenSet.has(cardName))show(host);
    densityProbe=null;
    scheduleLayout();
  }
  function closeSettingsModal({restoreFocus=true}={}){
    if(!settingsOpen)return;
    settingsOpen=false;
    clearTimeout(settingsHighlightTimer);settingsHighlightTimer=0;
    for(const row of root?.querySelectorAll('.settings-kv.is-highlight')||[]){row.classList.remove('is-highlight');row.removeAttribute('data-highlighted');}
    const opener=settingsTrigger;settingsTrigger=null;
    if(settingsDialog){
      attribute(settingsDialog,'data-open',null);
      cardVisibility(settingsDialog,false);
    }
    if(!disposed&&!instDisposed){
      scheduleLayout();
      if(restoreFocus&&opener?.isConnected)try{opener.focus({preventScroll:true});}catch{}
    }
  }
  function openSettingsModal(trigger=null,options=null){
    if(!settingsDialog)return;
    settingsTrigger=trigger||root?.activeElement||null;
    for(const other of instances){if(other.node!==node)other.hide();other.closeSettings?.({restoreFocus:false});}
    hide();
    lastSettingsSig='';
    settingsOpen=true;
    renderSettingsModal();
    attribute(settingsDialog,'data-open','true');
    cardVisibility(settingsDialog,true);
    localize();
    positionSettings();
    clearTimeout(settingsHighlightTimer);settingsHighlightTimer=0;
    for(const row of root?.querySelectorAll('.settings-kv.is-highlight')||[]){row.classList.remove('is-highlight');row.removeAttribute('data-highlighted');}
    if(options?.focusSetting){
      const targetRow=root?.querySelector(`[data-setting-key="${options.focusSetting}"]`);
      if(targetRow){
        targetRow.classList.add('is-highlight');
        targetRow.setAttribute('data-highlighted','true');
        requestAnimationFrame(()=>{if(settingsOpen&&targetRow.isConnected)targetRow.scrollIntoView({block:'center',behavior:'instant'});});
        settingsHighlightTimer=setTimeout(()=>{settingsHighlightTimer=0;if(targetRow.isConnected){targetRow.classList.remove('is-highlight');targetRow.removeAttribute('data-highlighted');}},2800);
      }
    }
  }
  function renderSettingsModal(){
    if(!root||!settingsDialog)return;
    const body=$('pulse-settings-body');
    if(!body)return;
    const order=barPrefs.order,hiddenSet=new Set(barPrefs.hidden),ctxMode=barPrefs.contextChipMode;
    const activeScheme=node?.dataset.pulseTheme==='light'?'light':'dark';
    const colors=barColorsPref.colors;
    const sig=JSON.stringify([language.language,order,barPrefs.hidden,ctxMode,barPrefs.error,themeModePref.value,themeModePref.error,activeScheme,colors,barColorsPref.error,cacheHitTone.value,cacheHitTone.error,cacheHitTiers.enabled,cacheHitTiers.error,inlineCacheHit.enabled,inlineCacheHit.error,cacheChipMode.value,cacheChipMode.error,quotaDisplay.value,quotaDisplay.error,speedStyle.style,speedStyle.error,hostUiLocalization.enabled,hostUiLocalization.error,barPlacement.placement,barPlacement.error,turnFooter.enabled,turnFooter.error,preferences.error]);
    if(lastSettingsSig===sig)return;
    lastSettingsSig=sig;
    const mk=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
    const segGroup=(ariaKey,items)=>{
      const g=mk('div','language-options');g.setAttribute('role','group');g.setAttribute('aria-label',t(ariaKey));
      for(const {label,attrs,active,onClick} of items){
        const b=mk('button','language-button',label);b.type='button';
        for(const [k,v] of Object.entries(attrs))b.setAttribute(k,String(v));
        b.setAttribute('aria-pressed',String(active));
        b.addEventListener('click',onClick);
        g.append(b);
      }
      return g;
    };

    // 1. Theme & Colors
    const secTheme=mk('section','settings-section');
    const themeHead=mk('div','settings-sec-head');
    themeHead.append(mk('span','',t('settingsSectionTheme')),segGroup('settingsMode',[
      {label:t('modeAuto'),attrs:{'data-theme-mode-choice':'auto'},active:themeModePref.value==='auto',onClick:()=>void themeModePref.choose('auto')},
      {label:t('modeLight'),attrs:{'data-theme-mode-choice':'light'},active:themeModePref.value==='light',onClick:()=>void themeModePref.choose('light')},
      {label:t('modeDark'),attrs:{'data-theme-mode-choice':'dark'},active:themeModePref.value==='dark',onClick:()=>void themeModePref.choose('dark')},
    ]));
    const colorSlots=[
      ['speed','barColorSpeed','#315fc4'],
      ['token','barColorToken','#7c3aed'],
      ['quota','barColorQuota','#0284c7'],
      ['context','barColorContext','#315fc4'],
      ...(cacheHitTiers.enabled?[]:[['cacheHit','barColorCacheHit','#315fc4']]),
    ];
    const presetSwatches=['#315fc4','#0284c7','#7c3aed','#16a34a','#d97706','#d97757'];
    const buildColorList=slots=>{
      const list=mk('div','bar-color-list');
      for(const [slot,labelKey,fallbackHex] of slots){
        const current=colors[slot]||null;
        const row=mk('div','bar-color-row');row.dataset.barColorRow=slot;
        const ctrls=mk('div','bar-color-ctrls');
        const defBtn=mk('button','bar-color-default',t('barColorDefault'));
        defBtn.type='button';defBtn.dataset.barColorDefault=slot;defBtn.setAttribute('aria-pressed',String(!current));
        defBtn.addEventListener('click',()=>void barColorsPref.setColor(slot,null));
        ctrls.append(defBtn);
        for(const hex of presetSwatches){
          const dot=mk('button','color-dot');dot.type='button';
          dot.dataset.barColorSlot=slot;dot.dataset.barColorPreset=hex;
          dot.style.background=hex;
          dot.setAttribute('aria-label',`${t(labelKey)} ${hex}`);
          dot.setAttribute('aria-pressed',String(current===hex));
          dot.addEventListener('click',()=>void barColorsPref.setColor(slot,hex));
          ctrls.append(dot);
        }
        const picker=mk('input','color-picker-input');picker.type='color';
        picker.dataset.barColorPicker=slot;
        picker.value=current||fallbackHex;
        picker.setAttribute('aria-label',`${t('barColorPick')} ${t(labelKey)}`);
        picker.title=t('barColorPick');
        picker.addEventListener('input',()=>themeController?.setBarColors?.({...barColorsPref.colors,[slot]:picker.value}));
        picker.addEventListener('change',()=>void barColorsPref.setColor(slot,picker.value));
        ctrls.append(picker);
        row.append(mk('span','bar-color-label',t(labelKey)),ctrls);
        list.append(row);
      }
      return list;
    };
    const colorList=buildColorList(colorSlots);
    const tierModeRow=mk('div','settings-tone-row');
    tierModeRow.append(mk('span','',t('cacheHitTiersLabel')),segGroup('cacheHitTiersLabel',[
      {label:t('cacheHitTiersFixed'),attrs:{'data-cache-hit-tiers-choice':'false'},active:!cacheHitTiers.enabled,onClick:()=>void cacheHitTiers.choose(false)},
      {label:t('cacheHitTiersAuto'),attrs:{'data-cache-hit-tiers-choice':'true'},active:cacheHitTiers.enabled,onClick:()=>void cacheHitTiers.choose(true)},
    ]));
    const themeChildren=[themeHead,colorList,tierModeRow];
    if(cacheHitTiers.enabled){
      themeChildren.push(buildColorList([
        ['cacheHitHigh','barColorCacheHitHigh','#16a34a'],
        ['cacheHitMid','barColorCacheHitMid','#315fc4'],
        ['cacheHitLow','barColorCacheHitLow','#d97706'],
        ['cacheHitCold','barColorCacheHitCold','#64748b'],
      ]));
    }
    secTheme.append(...themeChildren);

    // 2. Bar Modules & Display
    const cols=mk('div','settings-cols');
    const secBar=mk('section','settings-section');
    secBar.append(mk('div','settings-sec-head',t('settingsSectionBar')));
    const list=mk('div','bar-customize-list');
    const visibleCount=order.filter(id=>!hiddenSet.has(id)).length;
    const names={speed:'barChipSpeed',cache:'barChipCache',quota:'barChipQuota',context:'barChipContext'};
    order.forEach((id,idx)=>{
      const isVis=!hiddenSet.has(id),lastOne=isVis&&visibleCount<=1;
      const row=mk('div',isVis?'bar-customize-row':'bar-customize-row is-hidden');
      row.dataset.barRow=id;row.draggable=true;
      const handle=mk('span','bar-drag-handle','⋮⋮');handle.setAttribute('aria-hidden','true');
      const labelEl=mk('span','bar-row-name',t(names[id]));
      const moves=mk('span','bar-move-btns');
      const up=mk('button','bar-move-btn','↑');up.type='button';up.dataset.barMove='-1';up.disabled=idx===0;up.setAttribute('aria-label',t('barMoveUp'));
      up.addEventListener('click',()=>moveChip(id,-1));
      const down=mk('button','bar-move-btn','↓');down.type='button';down.dataset.barMove='1';down.disabled=idx===order.length-1;down.setAttribute('aria-label',t('barMoveDown'));
      down.addEventListener('click',()=>moveChip(id,1));
      moves.append(up,down);
      const sw=mk('button','bar-switch');sw.type='button';sw.setAttribute('role','switch');sw.setAttribute('aria-checked',String(isVis));
      sw.setAttribute('aria-label',t(names[id]));
      if(lastOne){sw.disabled=true;sw.title=t('barKeepOneHint');}
      sw.addEventListener('click',()=>toggleChipVisible(id));
      row.append(handle,labelEl,moves,sw);
      row.addEventListener('dragstart',e=>{draggingChipId=id;row.classList.add('is-dragging');try{e.dataTransfer?.setData('text/plain',id);}catch{}});
      row.addEventListener('dragend',()=>{draggingChipId=null;for(const el of root?.querySelectorAll('.chip,.bar-customize-row')||[])el.classList.remove('is-dragging','is-drag-over');});
      row.addEventListener('dragover',e=>{if(!draggingChipId||draggingChipId===id)return;e.preventDefault();row.classList.add('is-drag-over');});
      row.addEventListener('dragleave',()=>row.classList.remove('is-drag-over'));
      row.addEventListener('drop',e=>{e.preventDefault();row.classList.remove('is-drag-over');if(draggingChipId)reorderChips(draggingChipId,id);});
      list.append(row);
    });
    secBar.append(list);

    // 3. Display Options & Language
    const secGeneral=mk('section','settings-section');
    secGeneral.append(mk('div','settings-sec-head',t('settingsSectionGeneral')));
    const kv=mk('div','settings-kv-list');
    const addKv=(labelText,ctrlEl,labelId,settingKey)=>{const r=mk('div','settings-kv'),lbl=mk('span','',labelText);if(labelId)lbl.id=labelId;if(settingKey)r.setAttribute('data-setting-key',settingKey);r.append(lbl,ctrlEl);kv.append(r);};
    addKv(t('barPlacement'),segGroup('barPlacement',[
      {label:t('barPlacementInline'),attrs:{'data-bar-placement-choice':'inline'},active:barPlacement.placement==='inline',onClick:()=>void barPlacement.choose('inline')},
      {label:t('barPlacementFooter'),attrs:{'data-bar-placement-choice':'footer'},active:barPlacement.placement==='footer',onClick:()=>void barPlacement.choose('footer')},
    ]));
    addKv(t('turnFooter'),segGroup('turnFooter',[
      {label:t('turnFooterOff'),attrs:{'data-turn-footer-choice':'false'},active:!turnFooter.enabled,onClick:()=>void turnFooter.choose(false)},
      {label:t('turnFooterOn'),attrs:{'data-turn-footer-choice':'true'},active:turnFooter.enabled,onClick:()=>void turnFooter.choose(true)},
    ]),null,'turnFooter');
    addKv(t('cacheChipMode'),segGroup('cacheChipMode',[
      {label:t('cacheChipModeTokens'),attrs:{'data-cache-chip-mode':'tokens','data-inline-cache-hit-choice':'false'},active:cacheChipMode.value==='tokens',onClick:()=>void cacheChipMode.choose('tokens')},
      {label:t('cacheChipModeBoth'),attrs:{'data-cache-chip-mode':'both','data-inline-cache-hit-choice':'true'},active:cacheChipMode.value==='both',onClick:()=>void cacheChipMode.choose('both')},
      {label:t('cacheChipModeHit'),attrs:{'data-cache-chip-mode':'hit'},active:cacheChipMode.value==='hit',onClick:()=>void cacheChipMode.choose('hit')},
    ]));
    addKv(t('barContextChipMode'),segGroup('barContextChipMode',[
      {label:t('barContextModeRounds'),attrs:{'data-ctx-chip-mode':'rounds'},active:ctxMode==='rounds',onClick:()=>void barPrefs.update({contextChipMode:'rounds'})},
      {label:t('barContextModeLabel'),attrs:{'data-ctx-chip-mode':'label'},active:ctxMode==='label',onClick:()=>void barPrefs.update({contextChipMode:'label'})},
      {label:t('barContextModeCompact'),attrs:{'data-ctx-chip-mode':'compact'},active:ctxMode==='compact',onClick:()=>void barPrefs.update({contextChipMode:'compact'})},
    ]));
    addKv(t('quotaDisplay'),segGroup('quotaDisplay',[
      {label:t('quotaDisplayBoth'),attrs:{'data-quota-display-choice':'both'},active:quotaDisplay.value==='both',onClick:()=>void quotaDisplay.choose('both')},
      {label:t('quotaDisplayAuto'),attrs:{'data-quota-display-choice':'auto'},active:quotaDisplay.value==='auto',onClick:()=>void quotaDisplay.choose('auto')},
      {label:t('quotaDisplayCompact'),attrs:{'data-quota-display-choice':'compact'},active:quotaDisplay.value==='compact',onClick:()=>void quotaDisplay.choose('compact')},
      {label:t('quotaDisplayWeekly'),attrs:{'data-quota-display-choice':'weekly'},active:quotaDisplay.value==='weekly',onClick:()=>void quotaDisplay.choose('weekly')},
    ]));
    addKv(t('speedStyle'),segGroup('speedStyle',[
      {label:t('styleMinimal'),attrs:{'data-speed-style-choice':'minimal'},active:speedStyle.style==='minimal',onClick:()=>void speedStyle.choose('minimal')},
      {label:t('styleCat'),attrs:{'data-speed-style-choice':'cat'},active:speedStyle.style==='cat',onClick:()=>void speedStyle.choose('cat')},
    ]));
    addKv(t('hostUiLocalization'),segGroup('hostUiLocalization',[
      {label:t('hostUiLocalizationOff'),attrs:{'data-host-i18n-choice':'false'},active:!hostUiLocalization.enabled,onClick:()=>void hostUiLocalization.choose(false)},
      {label:t('hostUiLocalizationOn'),attrs:{'data-host-i18n-choice':'true'},active:hostUiLocalization.enabled,onClick:()=>void hostUiLocalization.choose(true)},
    ]),'host-i18n-label');
    addKv(t('dashboardLanguage'),segGroup('dashboardLanguage',[
      {label:'EN',attrs:{'data-language-choice':'en'},active:language.language==='en',onClick:()=>void preferences.choose('en')},
      {label:'简',attrs:{'data-language-choice':'zh-CN'},active:language.language==='zh-CN',onClick:()=>void preferences.choose('zh-CN')},
      {label:'繁',attrs:{'data-language-choice':'zh-TW'},active:language.language==='zh-TW',onClick:()=>void preferences.choose('zh-TW')},
    ]));
    secGeneral.append(kv);
    cols.append(secBar,secGeneral);

    const note=mk('p','footnote');note.id='settings-save-note';
    body.replaceChildren(secTheme,cols,note);
  }
  function render(){
    if(!root||!data)return;
    if(!parked&&composer)syncConversation();
    if(usageDashboard){
      const available=Boolean(data.usage);hidden($('usage-entry'),!available);
      text('usage-today',compact(data.usage?.todayTokens));text('usage-today-unit',tokUnit(data.usage?.todayTokens));
      text('usage-month',compact(data.usage?.monthTokens));text('usage-month-unit',tokUnit(data.usage?.monthTokens));
      usageDashboard.update(data.usage);
    }
    if(parked||!composer)return;
    const groups=data.groups||[],trigger=currentModelTrigger(),models=[trigger?.getAttribute('aria-label'),trigger?.getAttribute('title'),trigger?.textContent,data.speed?.model];
    autoGroupId=language.chooseQuotaGroup(groups,models,null)?.id||null;
    group=language.chooseQuotaGroup(groups,models,chosen);
    text('active-group-name',group?label(group):'—');
    hidden($('active-quota-group'),!group);
    const speed=data.speed,collection=data.collection;
    const taskUsage=Number.isSafeInteger(speed?.taskUsage?.subagents)&&speed.taskUsage.subagents>0?speed.taskUsage:null;
    const limited=collection?.state==='limited'&&collection.code==='budget-exceeded';
    const processing=collection?.state==='processing'&&collection.code==='background-collection',collectionActive=limited||processing;
    attribute(node,'data-collection',processing?'processing':limited?'limited':null);
    const cacheChip=root.querySelector('[data-card="cache"]');
    const currentOnly=!collectionActive&&taskUsage?.state==='partial'&&taskUsage.loadedSubagents===0;
    const cacheLabel=collectionActive?t(processing?'collectionProcessing':'collectionLimited'):currentOnly?t('taskCurrentOnly'):t('panelCache');
    attribute(cacheChip,'data-task-current-only',currentOnly?'true':null);
    attribute(cacheChip,'aria-label',cacheLabel);
    attribute(cacheChip,'title',collectionActive||currentOnly?cacheLabel:null);
    attribute(cacheChip,'aria-busy',processing?'true':null);
    const collectionLabel=root.querySelector('.collection-label'),collectionText=t(processing?'collectionProcessing':'collectionLimited');
    if(collectionLabel.textContent!==collectionText)collectionLabel.textContent=collectionText;
    for(const notice of root.querySelectorAll('.collection-notice')){
      hidden(notice,!collectionActive);if(!collectionActive){notice.querySelector('details').open=false;continue;}
      const set=(selector,value)=>{const element=notice.querySelector(selector);if(element.textContent!==value)element.textContent=value;};
      set('.collection-state',collection.freshness==='saved'&&Number.isFinite(Date.parse(collection.lastSuccessAt))?t('collectionSavedAt',{time:date(collection.lastSuccessAt)}):t(collection.freshness==='saved'?'collectionSaved':'collectionLimited'));
      set('[data-i18n="collectionReason"]',t(processing?'collectionProcessingReason':collection.reason?'collectionBackgroundFailed':'collectionReason'));
      set('summary',t(processing?'collectionProgress':'collectionDetails'));
      hidden(notice.querySelector('[data-i18n="collectionNoPartial"]'),processing);
      hidden(notice.querySelector('a'),processing);
      if(processing){
        if(collection.freshness!=='saved')set('.collection-state',t('collectionProcessing'));
        const stages={queued:'collectionQueued',steps:'collectionSteps',generators:'collectionGenerators',reducing:'collectionReducing',publishing:'collectionPublishing'};
        set('.collection-budget-kind',t(stages[collection.stage]||'collectionQueued'));
        const valid=n=>Number.isSafeInteger(n)&&n>=0,steps=collection.processedSteps,requests=collection.processedGenerators;
        hidden(notice.querySelector('.collection-budget-size'),!valid(steps)||!valid(requests));
        if(valid(steps)&&valid(requests))set('.collection-budget-size',t('collectionProgressCounts',{steps:count(steps),requests:count(requests)}));
        continue;
      }
      set('.collection-budget-kind',t(collection.kind==='projected-json'?'collectionProjected':collection.kind==='field'?'collectionField':'collectionRetained'));
      const characters=collection.unit==='characters',limit=characters?collection.limit:collection.limitBytes,observed=characters?collection.observed:collection.observedBytes;
      const valid=n=>Number.isSafeInteger(n)&&n>=0;
      const format=n=>characters?t('collectionCharacters',{n:count(n)}):`${(Math.floor(n/1048576*100)/100).toFixed(2)} MiB (${count(n)} B)`;
      const size=notice.querySelector('.collection-budget-size');hidden(size,!valid(limit)||!valid(observed));
      if(valid(limit)&&valid(observed))set('.collection-budget-size',t('collectionObserved',{observed:format(observed),limit:format(limit)}));
    }
    applyBarLayout();
    if(settingsOpen)renderSettingsModal();
    const hiddenSet=effectiveHiddenSet(),remoteSession=data.remoteSession||null;
    attribute(node,'data-remote-mode',remoteSession?.mode||null);
    attribute(node,'data-remote-host',remoteSession?.host||null);
    if(remoteSessionNote){
      if(remoteSession?.mode==='fallback'&&remoteSession.host){
        const noteText=t(remoteSession.reason==='unreachable'?'remoteFallbackUnreachable':'remoteFallbackUnconfigured',{host:remoteSession.host});
        if(remoteSessionNote.textContent!==noteText)remoteSessionNote.textContent=noteText;
        hidden(remoteSessionNote,false);
      }else hidden(remoteSessionNote,true);
    }
    const remoteConnectedTag=$('remote-connected-tag');
    if(remoteConnectedTag){
      const showTag=remoteSession?.mode==='connected'&&Boolean(remoteSession.host);
      hidden(remoteConnectedTag,!showTag);
      if(showTag)text('remote-connected-tag',t('remoteConnectedBadge',{host:remoteSession.host}));
    }
    hidden(root.querySelector('[data-card="speed"]'),hiddenSet.has('speed'));
    hidden(root.querySelector('[data-card="cache"]'),hiddenSet.has('cache'));
    const context=speed?.context,hasCapacity=typeof context?.usedFraction==='number';
    const rawContextPct=hasCapacity?Math.round(context.usedFraction*100):null;
    const contextPct=hasCapacity?Math.min(100,rawContextPct):null;
    const contextOverWindow=hasCapacity&&context.usedFraction>1;
    const overWindowRaw=contextOverWindow?(rawContextPct>100?String(rawContextPct):(context.usedFraction*100).toFixed(1)):'';
    const overWindowTip=contextOverWindow?t('contextOverWindow',{raw:overWindowRaw}):'';
    hasContextPercent=hasCapacity;
    const compactionsForState=speed?.transcriptStats&&['ready','partial'].includes(speed.transcriptStats.status)&&typeof speed.transcriptStats.compactionMarkers==='number'?speed.transcriptStats.compactionMarkers:null;
    if(pendingCompact&&(pendingCompact.conversationId!==conversationId()||Date.now()-pendingCompact.startedAt>=90000||speed?.compactionState==='compacted'||(compactionsForState!==null&&compactionsForState>pendingCompact.baseCompactions)||(pendingCompact.baseUsedTokens>0&&context?.usedTokens>0&&context.usedTokens<pendingCompact.baseUsedTokens*0.75))){pendingCompact=null;}
    const isCompacting=Boolean(pendingCompact||speed?.compactionState==='compacting');
    if(isCompacting&&!compactPollTimer){compactPollTimer=setTimeout(()=>{compactPollTimer=0;if(!disposed&&!instDisposed&&node?.isConnected)void refresh(true);},1200);}
    else if(!isCompacting&&compactPollTimer){clearTimeout(compactPollTimer);compactPollTimer=0;}
    const ringColor=isCompacting?'var(--pulse-accent)':!hasCapacity?'var(--pulse-bar-context,var(--pulse-ring))':context.usedFraction>=0.9?'var(--pulse-danger)':context.usedFraction>=0.75?'var(--pulse-warning)':'var(--pulse-bar-context,var(--pulse-ring))';
    hidden(root.querySelector('[data-card="context"]'),hiddenSet.has('context'));
    const empty=(surface&&!surface.useSharedComposer?surface.conversationState?.(composer).status==='new':composer?.kind==='main'&&(!lastConversation||(!speed?.requests&&!speed?.steps&&!hasCapacity)))&&data.connection==='live'&&!data.sessionError&&!collectionActive;
    text('context-percent',isCompacting?t('contextCompactingChip'):hasCapacity?`${contextPct}%`:'—');
    style($('context-ring'),'--used-angle',`${hasCapacity?Math.min(1,context.usedFraction)*360:0}deg`);
    style($('context-ring'),'--ring-color',ringColor);
    attribute($('context-ring'),'data-compacting',isCompacting?'true':null);
    text('context-summary',isCompacting?t('contextCompacting'):hasCapacity?t('contextUsed',{used:contextPct,remaining:Math.round(context.remainingFraction*100)}):collectionActive?'—':t(empty?'waitingRequest':'contextUnknown'));
    attribute($('context-summary'),'title',overWindowTip||null);
    text('context-tokens',context?t('contextTokens',{used:compact(context.usedTokens),max:context.maxTokens===null?'—':compact(context.maxTokens)}):'—');
    text('context-model',context?.model||'—');
    const transcript=speed?.transcriptStats;
    const roundCount=Number.isSafeInteger(speed?.rounds)&&speed.rounds>0?speed.rounds:null;
    const stepCount=Number.isSafeInteger(speed?.steps)&&speed.steps>=0?speed.steps:null;
    const roundsPill=$('context-rounds-pill'),stepsDrawer=$('context-steps-drawer');
    const sb=speed?.stepBreakdown;
    const stepBuckets=sb?[['tool','stepBucketTool'],['planner','stepBucketPlanner'],['user','stepBucketUser'],['compaction','stepBucketCompaction'],['other','stepBucketOther']].map(([key,lblKey])=>({key,label:t(lblKey),count:Number.isSafeInteger(sb[key])&&sb[key]>0?sb[key]:0})).filter(b=>b.count>0):[];
    const sbTotal=stepBuckets.reduce((sum,b)=>sum+b.count,0);
    const canExpandSteps=roundCount!==null&&sbTotal>0;
    if(!canExpandSteps)stepsDrawerOpen=false;
    if(roundsPill){
      hidden(roundsPill,roundCount===null);
      if(roundCount!==null){
        const baseText=stepCount!==null?t('contextTurnsSteps',{rounds:smallCount(roundCount),steps:smallCount(stepCount)}):t('contextTurnsCount',{n:smallCount(roundCount)});
        text('context-rounds-pill-text',baseText);
        if(roundsPill.disabled!==!canExpandSteps)roundsPill.disabled=!canExpandSteps;
        attribute(roundsPill,'aria-expanded',String(canExpandSteps&&stepsDrawerOpen));
        attribute(roundsPill,'title',stepCount!==null?`${t('contextTurnsTitle',{rounds:smallCount(roundCount),steps:smallCount(stepCount)})}${canExpandSteps?` · ${t('stepBreakdownHint')}`:''}`:t('contextTurnsCount',{n:smallCount(roundCount)}));
      }else{
        if(!roundsPill.disabled)roundsPill.disabled=true;
        attribute(roundsPill,'aria-expanded','false');
        attribute(roundsPill,'title',null);
      }
    }
    const compactions=transcript&&['ready','partial'].includes(transcript.status)&&typeof transcript.compactionMarkers==='number'?transcript.compactionMarkers:null;
    const compactionPill=$('context-compaction-pill');
    if(compactionPill){
      if(compactions!==null&&compactions>0){
        hidden(compactionPill,false);
        text('context-compaction-pill',t('contextCompactionCount',{n:compactions}));
        attribute(compactionPill,'title',`${t('contextCompactionsTitle',{n:compactions})}\n${t('compactionMetricsBasis')}`);
      }else{
        hidden(compactionPill,true);
      }
    }
    const mkEl=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
    const mkRow=(name,val,warn=false,critical=false)=>{
      const r=mkEl('div','breakdown-row');
      const v=mkEl('span',warn?'breakdown-row-val breakdown-row-warn':'breakdown-row-val',val);
      if(critical)v.dataset.critical='true';
      r.append(mkEl('span','breakdown-row-name',name),v);
      return r;
    };
    const bloatPill=$('context-bloat-pill');
    const bloatWarnings=Array.isArray(transcript?.bloatWarnings)?transcript.bloatWarnings:[];
    const hasBloat=bloatWarnings.length>0;
    if(bloatPill){
      hidden(bloatPill,!hasBloat);
      if(hasBloat){
        text('context-bloat-pill',`⚠ ${t('bloatBadge',{n:bloatWarnings.length})}`);
        attribute(bloatPill,'data-critical',bloatWarnings.some(w=>w.severity==='critical')?'true':null);
        attribute(bloatPill,'title',bloatWarnings.map(w=>t('bloatWarningLine',{tool:w.tool,step:w.stepIndex,tokens:compact(w.tokens)})).join('\n'));
      }else attribute(bloatPill,'data-critical',null);
    }
    const compactBtn=$('context-compact-btn');
    const canCompact=roundCount!==null&&Boolean(composer?.editor?.isConnected);
    if(compactBtn){
      const isRunningTurn=Boolean(speed&&/RUNNING/i.test(String(speed.status||'')));
      hidden(compactBtn,!canCompact);
      compactBtn.disabled=!canCompact||isRunningTurn||isCompacting;
      attribute(compactBtn,'data-compacting',isCompacting?'true':null);
      text('context-compact-btn-text',isCompacting?t('contextCompacting'):t('contextCompactBtn'));
      attribute(compactBtn,'title',isCompacting?t('contextCompacting'):t('contextCompactBtnTitle'));
    }
    hidden($('context-submeta-row'),roundCount===null&&!canCompact&&!(compactions!==null&&compactions>0)&&!hasBloat);
    if(stepsDrawer){
      const showDrawer=canExpandSteps&&stepsDrawerOpen;
      hidden(stepsDrawer,!showDrawer);
      if(showDrawer){
        const drawerSig=JSON.stringify([language.language,roundCount,sbTotal,stepBuckets]);
        if(stepsDrawer.dataset.signature!==drawerSig){
          stepsDrawer.dataset.signature=drawerSig;
          const head=mkEl('div','steps-drawer-head');
          head.append(mkEl('span','',t('stepBreakdownTitle',{n:smallCount(sbTotal)})),mkEl('span','steps-drawer-sub',t('contextTurnsCount',{n:smallCount(roundCount)})));
          const bar=mkEl('div','steps-bar');
          const chips=mkEl('div','steps-chips');
          for(const b of stepBuckets){
            const pct=((b.count/sbTotal)*100).toFixed(1);
            const seg=mkEl('i',`steps-seg-${b.key}`);
            seg.style.width=`${pct}%`;
            attribute(seg,'title',`${b.label}: ${smallCount(b.count)} (${pct}%)`);
            bar.append(seg);
            const chip=mkEl('span','steps-chip');
            attribute(chip,'title',seg.title);
            chip.append(mkEl('i',`steps-dot steps-seg-${b.key}`),mkEl('span','',b.label),mkEl('strong','',smallCount(b.count)));
            chips.append(chip);
          }
          stepsDrawer.replaceChildren(head,bar,chips);
        }
      }else if(stepsDrawer.dataset.signature){
        delete stepsDrawer.dataset.signature;stepsDrawer.replaceChildren();
      }
    }
    const ctxBreakdown=$('context-breakdown');
    if(ctxBreakdown){
      const hasSteps=Boolean(transcript&&['ready','partial'].includes(transcript.status)&&transcript.matchedSteps>0);
      const stepTools=Array.isArray(speed?.toolSummary?.tools)?speed.toolSummary.tools:[];
      const txTools=Array.isArray(transcript?.toolBreakdown)?transcript.toolBreakdown:[];
      const tools=txTools.length?txTools:stepTools;
      const showCtx=hasSteps||tools.length>0||hasBloat;
      hidden(ctxBreakdown,!showCtx);
      if(showCtx){
        const ctxSig=JSON.stringify([language.language,hasSteps,transcript?.userTokens,transcript?.assistantTokens,transcript?.responseTokens,transcript?.thinkingTokens,transcript?.toolTokens,transcript?.toolCallTokens,transcript?.systemTokens,transcript?.totalTokens,tools,bloatWarnings]);
        if(ctxBreakdown.dataset.signature!==ctxSig){
          ctxBreakdown.dataset.signature=ctxSig;
          text('ctx-breakdown-label',t('contextBreakdown'));
          text('ctx-breakdown-meta',hasBloat?t('bloatBadge',{n:bloatWarnings.length}):hasSteps?`${compact(transcript.totalTokens)} ${tokUnit(transcript.totalTokens)}`:`${tools.length}`);
          const nodes=[];
          if(hasSteps){
            const chips=mkEl('div','breakdown-chips');
            const think=transcript.thinkingTokens||0;
            const reply=transcript.responseTokens||Math.max(0,(transcript.assistantTokens||0)-think);
            const pairs=[['breakdownUser',transcript.userTokens||0],['breakdownReply',reply],['breakdownThinking',think],['breakdownToolCalls',transcript.toolCallTokens||0],['breakdownTools',transcript.toolTokens||0],['breakdownSystem',transcript.systemTokens||0]];
            for(const [k,v]of pairs)if(v>0){const c=mkEl('span','breakdown-chip');c.append(mkEl('span','',t(k)),mkEl('strong','',compact(v)));chips.append(c);}
            if(chips.childNodes.length)nodes.push(chips);
          }
          if(tools.length){
            const sec=mkEl('div','breakdown-section');
            sec.append(mkEl('div','breakdown-head',t('topTools')));
            for(const tl of tools.slice(0,5)){
              const res=tl.resultTokens||0,args=tl.argTokens||0,total=res+args;
              const detail=res>0?`${compact(total)} (${tl.calls}×)`:args>0?`${compact(args)} args · ${tl.calls}×`:`${tl.calls}×`;
              sec.append(mkRow(tl.name,detail,tl.maxResultTokens>=20000||args>=20000,tl.maxResultTokens>=50000||args>=50000));
            }
            nodes.push(sec);
          }
          if(hasBloat){
            const sec=mkEl('div','breakdown-section');
            sec.append(mkEl('div','breakdown-head',t('bloatHint')));
            for(const w of bloatWarnings.slice(0,4))sec.append(mkRow(`${w.tool} #${w.stepIndex}`,`${compact(w.tokens)} ${tokUnit(w.tokens)}`,true,w.severity==='critical'));
            nodes.push(sec);
          }
          $('ctx-breakdown-body').replaceChildren(...nodes);
        }
      }else if(ctxBreakdown.dataset.signature){
        delete ctxBreakdown.dataset.signature;$('ctx-breakdown-body').replaceChildren();
      }
    }
    const newerVer=(a,b)=>{const p=s=>/^(\d+)\.(\d+)\.(\d+)$/.exec(String(s||''));const x=p(a),y=p(b);if(!x||!y)return false;for(let i=1;i<=3;i++){const d=Number(x[i])-Number(y[i]);if(d)return d>0;}return false;};
    const updateMenuState=updateMenu?.getState?.();
    const passiveAvail=Boolean(data?.update?.available),passiveVer=data?.update?.latestVersion||null;
    const suppressedByCurrent=updateMenuState?.state==='current'&&(!passiveAvail||!newerVer(passiveVer,updateMenuState?.latestVersion||updateMenuState?.currentVersion));
    const updateSuppressed=suppressedByCurrent||['installed','reloading'].includes(updateMenuState?.state);
    const hasUpdate=!updateSuppressed&&Boolean(updateMenuState?.state==='available'||passiveAvail);
    const updateVer=(updateMenuState?.state==='available'?updateMenuState.latestVersion:passiveVer)||null;
    updateMenu?.syncHint?.({available:hasUpdate,latestVersion:updateVer});
    const ctxChip=root.querySelector('[data-card="context"]');
    if(ctxChip){
      const ctxMode=barPrefs.contextChipMode;
      attribute(ctxChip,'data-ctx-mode',ctxMode);
      const showChipRounds=hasCapacity&&roundCount!==null&&ctxMode==='rounds';
      const chipRoundsEl=$('context-rounds');
      if(chipRoundsEl){
        hidden(chipRoundsEl,!showChipRounds);
        if(showChipRounds)text('context-rounds',t('contextChipRounds',{n:smallCount(roundCount)}));
      }
      attribute(ctxChip,'data-has-rounds',showChipRounds?'true':null);
      const roundSuffix=roundCount!==null?` · ${t('contextTurnsCount',{n:smallCount(roundCount)})}`:'';
      const compSuffix=compactions!==null&&compactions>0?` · ${t('contextCompactionSummary',{n:compactions})}`:'';
      const updateSuffix=hasUpdate&&updateVer?` · v${updateVer}`:'';
      const overSuffix=overWindowTip?` · ${overWindowTip}`:'';
      const baseTip=hasCapacity?`Ctx ${contextPct}% (${compact(context.usedTokens)} / ${compact(context.maxTokens)})${overSuffix}${roundSuffix}${compSuffix}`:(roundSuffix||compSuffix?`Ctx${roundSuffix}${compSuffix}`:'');
      attribute(ctxChip,'data-update-available',hasUpdate?'true':null);
      attribute(ctxChip,'title',baseTip?(baseTip+updateSuffix):(hasUpdate&&updateVer?`v${updateVer}`:null));
    }
    style($('context-fill'),'width',hasCapacity?`${Math.min(1,context.usedFraction)*100}%`:'0%');
    style($('context-fill'),'background',hasCapacity&&context.usedFraction>=.9?'var(--pulse-danger)':hasCapacity&&context.usedFraction>=.75?'var(--pulse-warning)':'');
    attribute($('context-track'),'aria-valuenow',hasCapacity?Math.min(100,context.usedFraction*100):null);attribute($('context-track'),'aria-valuemin','0');attribute($('context-track'),'aria-valuemax','100');
    const usage=taskUsage||speed,cache=usage?.cache;
    renderComposition(speed?.contextComposition,cache);
    const isFiniteRate=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
    const rateStatus=speed?.latestRateStatus;
    const legacyRate=rateStatus==='legacy',shortRate=rateStatus==='short',bufferedRate=rateStatus==='buffered',unreliableRate=rateStatus==='unreliable';
    const statusRate=legacyRate||shortRate||bufferedRate||unreliableRate;
    const stripRate=!speed||legacyRate?null:!statusRate&&isFiniteRate(speed.latestTps)?speed.latestTps:isFiniteRate(speed.tps)?speed.tps:null;
    const isRunning=Boolean(speed&&/RUNNING/i.test(String(speed.status||'')));
    const trailSamples=speed&&!legacyRate?(Array.isArray(speed.recentTps)&&speed.recentTps.length?speed.recentTps.filter(v=>isFiniteRate(v)&&v>0):stripRate>0?[Math.round(stripRate*10)/10]:[]):[];
    const relSpeed=trailSamples.length>=2?(()=>{const mean=trailSamples.reduce((a,b)=>a+b,0)/trailSamples.length;return mean>0?trailSamples[trailSamples.length-1]/mean:1;})():1;
    const catStride=Number.isFinite(relSpeed)&&relSpeed>0?Math.min(0.7,Math.max(0.14,0.36/(relSpeed*relSpeed))):0.36;
    const activeAge=Date.now()-Date.parse(speed?.lastActiveAt||speed?.context?.sampledAt||speed?.savedAt||'');
    const catMood=isRunning?(relSpeed>=1.1?'dash':'run'):Number.isFinite(activeAge)&&activeAge>1800000?'sleep':'idle';
    const speedChip=root.querySelector('[data-card="speed"]');
    attribute(speedChip,'data-running',isRunning?'true':null);
    attribute(speedChip,'title',speed?`${t('sessionAvg')}: ${rate(speed.tps)} tok/s · ${t('e2eShort')}: ${rate(speed.e2eTps)} tok/s`:null);
    paintSpeed(trailSamples,catMood,catStride,isRunning);
    text('tps',rate(stripRate));text('rounds',speed?t('rounds',{rounds:speed.rounds,steps:speed.steps}):'');
    text('speed-basis-tag',speed?t(speed.rateBasis==='all-output'?'basisShortAll':'basisShortResponse'):'');
    attribute($('speed-basis-tag'),'title',speed?language.rateNote(speed):null);
    text('samples',speed?t('sample',{rounds:speed.rounds,steps:speed.steps,requests:speed.measuredRequests}):collectionActive?'—':t(data.sessionError?'collectionUnavailable':'waitingRequest'));
    const ttftVal=speed?.ttftMedianSeconds??speed?.ttftSeconds,ttftLast=speed?.latestTtftSeconds;
    const ttftShort=v=>v>=60?seconds(v):`${v>=10?v.toFixed(1):v.toFixed(2)}s`;
    if(isFiniteRate(ttftVal)&&ttftVal<60){text('ttft',ttftVal>=10?ttftVal.toFixed(1):ttftVal.toFixed(2));text('ttft-unit',isFiniteRate(ttftLast)?'s':' s');}
    else{text('ttft',seconds(ttftVal));text('ttft-unit','');}
    text('ttft-latest',isFiniteRate(ttftLast)?` / ${ttftShort(ttftLast)}`:'');
    attribute($('ttft-cell'),'title',t('ttftBasis',{p50:seconds(ttftVal),latest:seconds(ttftLast)}));
    text('session-rate',legacyRate?t('ratePending'):rate(speed?.tps));hidden($('session-unit'),Boolean(legacyRate));
    attribute($('session-speed-cell'),'title',speed?language.rateNote(speed):null);
    text('e2e-rate',legacyRate?t('ratePending'):rate(speed?.e2eTps));hidden($('e2e-unit'),Boolean(legacyRate));
    attribute($('e2e-speed-cell'),'title',t('e2eBasis'));
    text('latest-rate',shortRate?t('timingShort'):bufferedRate?t('timingBuffered'):unreliableRate?t('timingUnreliable'):legacyRate?t('ratePending'):rate(stripRate));
    attribute($('latest-rate'),'data-status',statusRate?'true':null);
    attribute($('latest-rate'),'data-rate-state',statusRate?rateStatus:null);
    hidden($('latest-unit'),Boolean(statusRate));
    const durVal=speed?.latestDurationSeconds;
    const durStr=isFiniteRate(durVal)?(durVal>=10?`${durVal.toFixed(1)}s`:`${durVal.toFixed(2)}s`):'';
    const tokStr=typeof speed?.latestOutputTokens==='number'&&Number.isSafeInteger(speed.latestOutputTokens)?count(speed.latestOutputTokens):'';
    const hasPrevRef=Boolean(speed?.prevQualifiedSameModel&&isFiniteRate(speed?.prevQualifiedTps));
    const subText=shortRate&&tokStr&&durStr?(hasPrevRef?t('shortSublineRef',{tokens:tokStr,dur:durStr,prev:rate(speed.prevQualifiedTps)}):t('shortSubline',{tokens:tokStr,dur:durStr})):bufferedRate&&tokStr&&durStr?(isFiniteRate(speed?.latestE2eTps)?t('bufferedSublineE2e',{tokens:tokStr,dur:durStr,e2e:rate(speed.latestE2eTps)}):t('shortSubline',{tokens:tokStr,dur:durStr})):'';
    text('latest-sub',subText);
    hidden($('latest-sub'),!subText);
    let heroTip=t('latestSpeedTip');
    if((shortRate||bufferedRate)&&tokStr&&durStr){
      heroTip=t(shortRate?'shortSpeedTip':'bufferedSpeedTip',{tokens:tokStr,dur:durStr});
      if(isFiniteRate(speed?.latestE2eTps))heroTip+=t('latestTipE2e',{e2e:rate(speed.latestE2eTps)});
      if(hasPrevRef)heroTip+=t('latestTipPrev',{prev:rate(speed.prevQualifiedTps)});
    }
    attribute($('speed-hero'),'title',heroTip);
    const peakCandidate=legacyRate||!speed?-1:isFiniteRate(speed.peakTps)?speed.peakTps:Math.max(isFiniteRate(speed.tps)?speed.tps:-1,!statusRate&&isFiniteRate(speed.latestTps)?speed.latestTps:-1);
    text('peak-rate',peakCandidate>=0?rate(peakCandidate):'—');hidden($('peak-unit'),false);
    attribute($('peak-speed-cell'),'title',t('peakBasis'));
    text('speed-times',speed?`${seconds(speed.modelSeconds)} / ${seconds(speed.toolSeconds)}`:'—');
    attribute($('speed-meta'),'title',speed?`${t('modelTime')}: ${seconds(speed.modelSeconds)} · ${t('toolTime')}: ${seconds(speed.toolSeconds)}`:null);
    const respOut=speed?.counts?.responseOutput,thinkOut=speed?.counts?.thinkingOutput;
    text('tokens',speed?`${count(respOut)} / ${count(thinkOut)} ${tokUnit((respOut||0)+(thinkOut||0))}`:'—');
    text('cache-detail-rate',pct(cache?.hitRate));
    const tokens=usage?.tokens || cache;
    // Keep coverage in the data model; the compact card shows readable counters.
    const hasTotal=tokens?.measuredRequests&&Number.isSafeInteger(tokens.totalTokens)&&tokens.totalTokens>=0;
    const hasStripData=Boolean(collectionActive||stripRate!==null||hasTotal||(typeof cache?.hitRate==='number'&&Number.isFinite(cache.hitRate))||hasCapacity||(group&&!hiddenSet.has('quota')));
    if(!hasStripData){
      emptyCompact=true;
      if(hydrated)seenEmptySession=true;
    }else{
      if(emptyCompact){
        emptyCompact=false;
        if(seenEmptySession){seenEmptySession=false;springNextExpand=true;}
        else suppressNextMotion=true;
      }
      hydrated=true;
    }
    attribute(node,'data-cache-chip-mode',cacheChipMode.value);
    attribute(node,'data-inline-cache-hit',cacheChipMode.value==='tokens'?'false':'true');
    const hitText=pct(cache?.hitRate);
    const hitRateNum=typeof cache?.hitRate==='number'&&Number.isFinite(cache.hitRate)?cache.hitRate:null;
    const hitTone=hitRateNum===null?null:hitRateNum>=0.9?'high':hitRateNum>=0.8?'mid':hitRateNum>=0.7?'low':'cold';
    text('cache-total-num',hasTotal?compact(tokens.totalTokens):'—');
    text('cache-hit',cacheChipMode.value==='hit'?hitText:(hitText!=='—'?hitText:''));
    attribute($('cache-hit'),'data-tone',cacheHitTiers.enabled?hitTone:null);
    hidden($('cache-hit'),cacheChipMode.value==='tokens'||(cacheChipMode.value!=='hit'&&hitText==='—'));
    text('cache-coverage',hasTotal?(tokens.totalTokens>=1e9?compactDetail(tokens.totalTokens):count(tokens.totalTokens)):'—');
    text('cache-coverage-unit',hasTotal?tokUnit(tokens.totalTokens):'toks');
    attribute($('cache-hero-total'),'title',hasTotal&&tokens.totalTokens>=1e9?`${count(tokens.totalTokens)} ${tokUnit(tokens.totalTokens)}`:null);
    const inputCoverage={uncachedTokens:'uncachedRequests',cachedTokens:'cachedRequests',cacheWriteTokens:'cacheWriteRequests'};
    for(const [field,id,labelKey]of[['cachedTokens','cache-read','cacheRead'],['uncachedTokens','cache-miss','cacheMiss'],['outputTokens','cache-output','cacheOutput']]) {
      const available=field==='outputTokens'?(tokens?.outputAvailable??(tokens?.outputRequests??tokens?.measuredRequests)):(tokens?.[inputCoverage[field]]??tokens?.inputRequests??tokens?.measuredRequests);
      const known=Number.isSafeInteger(tokens?.[field])&&tokens[field]>=0;
      if(available&&known){
        const v=tokens[field];
        text(id,compactDetail(v));text(`${id}-unit`,` ${tokUnit(v)}`);hidden($(`${id}-unit`),false);
        attribute($(`${id}-cell`),'title',`${t(labelKey)}: ${count(v)} ${tokUnit(v)}`);
      }else{
        text(id,'—');hidden($(`${id}-unit`),true);attribute($(`${id}-cell`),'title',null);
      }
    }
    const cwAvail=tokens?.cacheWriteRequests??tokens?.inputRequests??tokens?.measuredRequests;
    const cwKnown=cwAvail&&Number.isSafeInteger(tokens?.cacheWriteTokens)&&tokens.cacheWriteTokens>=0;
    const cwVal=tokens?.cacheWriteTokens;
    text('cache-write',cwKnown?`${cwVal>=1e9?compactDetail(cwVal):count(cwVal)} ${tokUnit(cwVal)}`:'—');
    attribute($('cache-write-row'),'title',cwKnown&&cwVal>=1e9?`${count(cwVal)} ${tokUnit(cwVal)}`:null);
    const readVal=Number.isSafeInteger(tokens?.cachedTokens)&&tokens.cachedTokens>0?tokens.cachedTokens:0;
    const missVal=Number.isSafeInteger(tokens?.uncachedTokens)&&tokens.uncachedTokens>0?tokens.uncachedTokens:0;
    const outVal=Number.isSafeInteger(tokens?.outputTokens)&&tokens.outputTokens>0?tokens.outputTokens:0;
    const meterSum=readVal+missVal+outVal;
    style($('cache-seg-read'),'width',meterSum?`${(readVal/meterSum)*100}%`:'0%');
    style($('cache-seg-miss'),'width',meterSum?`${(missVal/meterSum)*100}%`:'0%');
    style($('cache-seg-out'),'width',meterSum?`${(outVal/meterSum)*100}%`:'0%');
    hidden($('cache-write-row'),!(tokens?.cacheWriteTokens>0));
    hidden($('task-own-row'),!taskUsage);hidden($('task-subagents-row'),!taskUsage);
    text('task-subagents-label',taskUsage?t(taskUsage.isSwarm?'taskSwarm':'taskSubagents',{n:count(taskUsage.subagents)}):'');
    for(const [field,id,rowId]of[['ownTokens','task-own','task-own-row'],['subagentTokens','task-subagents','task-subagents-row']]){
      const value=taskUsage?.[field],known=field!=='subagentTokens'||taskUsage?.loadedSubagents>0;
      const ok=known&&Number.isSafeInteger(value)&&value>=0;
      text(id,ok?`${value>=1e9?compactDetail(value):count(value)} ${tokUnit(value)}`:'—');
      attribute($(rowId),'title',ok&&value>=1e9?`${count(value)} ${tokUnit(value)}`:null);
    }
    const taskNote=taskUsage?.state==='loading'?t('taskLoading'):taskUsage?.state==='partial'?t(taskUsage.loadedSubagents===0?'taskCurrentOnly':'taskPartial'):'';
    text('cache-note',taskNote);hidden($('cache-note'),!taskNote);
    const orchPhaseEl=$('orchestrator-breakdown');
    const orch=speed?.orchestrator?.detected?speed.orchestrator:null;
    if(orchPhaseEl){
      hidden(orchPhaseEl,!orch);
      if(orch){
        const phaseSig=JSON.stringify([language.language,orch]);
        if(orchPhaseEl.dataset.signature!==phaseSig){
          orchPhaseEl.dataset.signature=phaseSig;
          text('orch-phase-label',t('orchCardTitle'));
          text('orch-phase-meta',orch.switched?t('orchSwitchCount',{n:count(orch.phaseSwitchCount||1)}):t('orchReadOnlyTag'));
          const phaseNodes=[];
          const sec=mkEl('div','breakdown-section');
          sec.append(mkEl('div','breakdown-head',t('orchScopeHint')));
          if(orch.planner){
            const pName=`${t('orchRolePlanner')} · ${orch.planner.model||orch.configuredPlanner||'—'}`;
            const pVal=`${compact(orch.planner.totalTokens)} · ${t('reqCountShort',{n:smallCount(orch.planner.requests)})} · ${pct(orch.planner.hitRate)}`;
            const r=mkRow(pName,pVal);
            attribute(r,'title',`${pName} — ${pVal}`);
            sec.append(r);
          }
          if(orch.executor){
            const eName=`${t('orchRoleExecutor')} · ${orch.executor.model||orch.configuredExecutor||'—'}`;
            const eVal=`${compact(orch.executor.totalTokens)} · ${t('reqCountShort',{n:smallCount(orch.executor.requests)})} · ${pct(orch.executor.hitRate)}`;
            const r=mkRow(eName,eVal);
            attribute(r,'title',`${eName} — ${eVal}`);
            sec.append(r);
          }
          if(!orch.switched){
            const noSwitch=t('orchNoSwitchYet');
            const r=mkRow(noSwitch,'');
            attribute(r,'title',noSwitch);
            sec.append(r);
            if(orch.configuredPlanner&&orch.configuredExecutor){
              const pairText=t('orchConfiguredPair',{planner:orch.configuredPlanner,executor:orch.configuredExecutor});
              const pr=mkRow(pairText,'');
              attribute(pr,'title',pairText);
              sec.append(pr);
            }
          }
          if(orch.coldStartSwitches>0){
            const r=mkRow(t('orchColdStartLabel'),t('countTimes',{n:smallCount(orch.coldStartSwitches)}),false,false);
            attribute(r,'title',t('orchColdStartTip'));
            sec.append(r);
          }
          phaseNodes.push(sec);
          $('orch-phase-body').replaceChildren(...phaseNodes);
        }
      }else if(orchPhaseEl.dataset.signature){
        delete orchPhaseEl.dataset.signature;$('orch-phase-body').replaceChildren();
      }
    }
    const orchEl=$('orchestration-breakdown');
    if(orchEl){
      const sessionModels=Array.isArray(speed?.modelBreakdown)?speed.modelBreakdown:[];
      const taskModels=Array.isArray(taskUsage?.modelBreakdown)?taskUsage.modelBreakdown:[];
      const models=taskUsage&&taskModels.length?taskModels:sessionModels;
      const surges=speed?.cacheMissSurges||0;
      const roleMeta=speed?.sessionMeta||null;
      const showOrch=Boolean(taskUsage||sessionModels.length>1||surges>0||roleMeta?.isSubagent||roleMeta?.isSidecar);
      hidden(orchEl,!showOrch);
      if(showOrch){
        const orchSig=JSON.stringify([language.language,models,taskUsage?.poolBreakdown||null,taskUsage?.roleBreakdown||null,taskUsage?.agents||null,Boolean(taskUsage?.isSwarm),taskUsage?.swarmTitle||null,swarmRosterFilter,surges,speed?.cacheMissSurgeTokens||0,roleMeta]);
        if(orchEl.dataset.signature!==orchSig){
          orchEl.dataset.signature=orchSig;
          text('orch-summary-label',taskUsage?.isSwarm?(taskUsage.swarmTitle?`Swarm · ${taskUsage.swarmTitle}`:t('swarmDetails')):t('multiAgentDetails'));
          const poolMap=taskUsage?.poolBreakdown||(()=>{
            const out={gemini:{totalTokens:0,requests:0},'3p':{totalTokens:0,requests:0},local:{totalTokens:0,requests:0},other:{totalTokens:0,requests:0}};
            for(const m of models){const b=out[m.pool]||out.other;b.totalTokens+=m.totalTokens||0;b.requests+=m.requests||0;}
            return out;
          })();
          const poolNames={gemini:t('poolGemini'),'3p':t('pool3p'),local:t('poolLocal'),other:t('poolOther')};
          const activePools=Object.entries(poolMap).filter(([,v])=>v&&(v.totalTokens>0||v.requests>0));
          const poolTotal=activePools.reduce((n,[,v])=>n+(v.totalTokens||0),0);
          text('orch-summary-meta',activePools.length?activePools.map(([p,v])=>`${poolNames[p]||p} ${compact(v.totalTokens)}`).slice(0,2).join(' · '):`${models.length}`);
          const nodes=[];
          if(taskUsage?.isSwarm){
            nodes.push(mkEl('div','breakdown-head',t('swarmScopeHint')));
          }
          if(activePools.length){
            const sec=mkEl('div','breakdown-section');
            sec.append(mkEl('div','breakdown-head',t('poolRollup')));
            const chips=mkEl('div','breakdown-chips');
            for(const [pk,pv]of activePools){
              const c=mkEl('span','breakdown-chip'),sharePct=poolTotal?` (${Math.round((pv.totalTokens||0)/poolTotal*100)}%)`:'';
              c.append(mkEl('span','',poolNames[pk]||pk),mkEl('strong','',`${compact(pv.totalTokens)}${sharePct}`));
              chips.append(c);
            }
            sec.append(chips);nodes.push(sec);
          }
          const rb=taskUsage?.roleBreakdown;
          if(rb&&(rb.worker.agents>0||rb.monitor.agents>0||rb.sidecar.agents>0)){
            const sec=mkEl('div','breakdown-section');
            const roleLabels={coordinator:t('roleCoordinator'),worker:t('roleWorker'),monitor:t('roleMonitor'),sidecar:t('roleSidecar')};
            for(const rk of ['coordinator','worker','monitor','sidecar']){
              const rv=rb[rk];if(!rv||(!rv.agents&&!rv.requests))continue;
              sec.append(mkRow(`${roleLabels[rk]} (${rv.agents})`,`${compact(rv.totalTokens)} ${tokUnit(rv.totalTokens)}`));
            }
            nodes.push(sec);
          }else if(roleMeta?.isSubagent||roleMeta?.isSidecar){
            const roleKey=roleMeta.isSidecar?'roleSidecar':roleMeta.agentRole==='monitor'?'roleMonitor':roleMeta.agentRole==='coordinator'?'roleCoordinator':'roleWorker';
            nodes.push(mkRow(t('sessionRoleLabel'),t(roleKey)));
          }
          if(models.length){
            const sec=mkEl('div','breakdown-section');
            for(const m of models.slice(0,6)){
              const thinkPart=m.thinkingTokens>0?` · ${compact(m.thinkingTokens)}`:'';
              const mRow=mkRow(m.model,`${compact(m.totalTokens)} · ${t('reqCountShort',{n:smallCount(m.requests)})}${thinkPart}`,false,false);
              attribute(mRow,'title',`${m.model} · ${poolNames[m.pool]||m.pool}${m.thinkingTokens>0?` · ${t('breakdownThinking')} ${compact(m.thinkingTokens)}`:''}`);
              sec.append(mRow);
            }
            if(surges>0){
              const sRow=mkRow(t('cacheMissSurgeLabel'),`${t('reqCountShort',{n:smallCount(surges)})} · ${compact(speed?.cacheMissSurgeTokens||0)}`,false,false);
              attribute(sRow,'title',t('cacheMissSurgeTip'));
              sec.append(sRow);
            }
            nodes.push(sec);
          }
          const agList=Array.isArray(taskUsage?.agents)?taskUsage.agents:[];
          if(agList.length>1||(taskUsage?.isSwarm&&agList.length>0)){
            const sec=mkEl('div','breakdown-section');
            const activeAgents=agList.filter(a=>!a.killed),endedAgents=agList.filter(a=>a.killed);
            const hasBoth=activeAgents.length>0&&endedAgents.length>0;
            const effFilter=hasBoth?swarmRosterFilter:(activeAgents.length>0?'active':'ended');
            const visibleAgents=effFilter==='active'?activeAgents:effFilter==='ended'?endedAgents:[...activeAgents,...endedAgents];
            if(taskUsage?.isSwarm||hasBoth){
              const head=mkEl('div','roster-head');
              head.append(taskUsage?.isSwarm?mkEl('div','breakdown-head',t('swarmRoster')):mkEl('span'));
              if(hasBoth){
                const bar=mkEl('div','segmented-options roster-filter');bar.id='orch-roster-filter';attribute(bar,'role','group');
                for(const [k,labelKey,n] of [['active','swarmStatusActive',activeAgents.length],['ended','swarmStatusKilled',endedAgents.length],['all','swarmStatusAll',agList.length]]){
                  const b=mkEl('button','segmented-button',`${t(labelKey)} ${smallCount(n)}`);
                  b.type='button';b.dataset.rosterFilter=k;attribute(b,'aria-pressed',String(effFilter===k));
                  b.addEventListener('click',()=>{
                    const hadFocus=root.activeElement===b;
                    clearTimeout(hoverTimer);hoverTimer=null;ignoreLeaveUntil=Date.now()+250;
                    swarmRosterFilter=k;
                    render();position();
                    if(hadFocus)$('orch-roster-filter')?.querySelector(`[data-roster-filter="${k}"]`)?.focus({preventScroll:true});
                  });
                  bar.append(b);
                }
                head.append(bar);
              }
              sec.append(head);
            }
            const maxActive=Math.max(1,...activeAgents.map(a=>a.tokens||0));
            const list=mkEl('div','roster-list');
            const shortName=l=>String(l||'').replace(/^(?:Worker|Monitor|Sidecar)\s*\((.+)\)$/,'$1');
            for(const a of visibleAgents){
              const item=mkEl('div',a.killed?'roster-item is-ended':'roster-item');
              const wsTag=a.workspaceMode&&a.workspaceMode!=='inherit'?` [${a.workspaceMode}]`:'';
              const statusTag=a.killed?` · ${t('swarmStatusKilled')}`:'';
              const tokText=compact(a.tokens),reqText=t('reqCountShort',{n:smallCount(a.requests)});
              attribute(item,'title',`${a.label}${wsTag}${statusTag} · ${a.model} — ${tokText} · ${reqText}`);
              const top=mkEl('div','roster-top'),left=mkEl('span','roster-left');
              left.append(mkEl('span','roster-dot'),mkEl('span','roster-name',shortName(a.label)));
              if(a.workspaceMode&&a.workspaceMode!=='inherit')left.append(mkEl('span','roster-ws',a.workspaceMode));
              top.append(left,mkEl('span','roster-tok',tokText));
              const sub=mkEl('div','roster-sub');
              sub.append(mkEl('span','roster-model',a.model),mkEl('span','roster-req',reqText));
              item.append(top,sub);
              if(!a.killed&&(a.tokens||0)>0){
                const bar=mkEl('div','roster-bar'),fill=mkEl('i');
                fill.style.width=`${Math.max(4,Math.round((a.tokens/maxActive)*100))}%`;
                bar.append(fill);item.append(bar);
              }
              list.append(item);
            }
            sec.append(list);
            nodes.push(sec);
          }
          $('orch-body').replaceChildren(...nodes);
        }
      }else if(orchEl.dataset.signature){
        delete orchEl.dataset.signature;$('orch-body').replaceChildren();
      }
    }
    const visibleQuotaWindows=language.quotaWindows(group),isArgon=language.quotaGroupKind(group)==='gemini-argon';
    const nextQuotaSig=JSON.stringify([data.quotaUpdatedAt||null,groups]);
    if(nextQuotaSig!==quotaSigCache){quotaSigCache=nextQuotaSig;quotaObservedAt=Date.now();}
    const paceNow=quotaObservedAt||Date.now();
    const forecastOpts={dailyWorkHours:data.usage?.dailyWorkHours};
    const pace=group?language.groupQuotaPace(group,paceNow,forecastOpts):null;
    const paceBadge=$('quota-pace');
    if(paceBadge){
      hidden(paceBadge,!pace);
      if(pace){
        text('quota-pace-text',pace.label);
        attribute(paceBadge,'data-pace',pace.pace);
        attribute(paceBadge,'data-critical',pace.critical?'true':null);
        attribute(paceBadge,'title',pace.title);
      }
    }
    const quotaError=language.errorMessage(data.error);
    for(const [window,name]of[['5h','five'],['weekly','week']]){
      hidden($(`${name}-quota-section`),!visibleQuotaWindows.includes(window));
      const heading=t(window==='weekly'&&isArgon?'argonWeek':name);
      text(`${name}-quota-title`,heading);attribute($(`${name}-quota-section`),'aria-label',heading);attribute($(`${name}-track`),'aria-label',heading);
      const b=group?.windows?.[window],remaining=language.quotaRemaining(b),balance=b?.disabled?t('unavailableQuota'):pct(remaining);
      const forecast=language.quotaForecast(b,window,paceNow,forecastOpts);
      const barBg=remaining!==null&&remaining<.05?'var(--pulse-danger)':'';
      text(name,balance);text(`${name}-balance`,balance);
      style($(`${name}-fill`),'width',remaining!==null?`${remaining*100}%`:'0%');style($(`${name}-fill`),'background',barBg);
      const forecastEl=$(`${name}-forecast`),fTextEl=$(`${name}-forecast-text`),usageEl=$(`${name}-usage`);
      const showF=Boolean(forecast&&typeof forecast.timeRemaining==='number');
      const winUsage=group?.id&&!b?.disabled&&b?.available?data.usage?.quotaWindows?.[`${group.id}:${window}`]:null;
      const showUsage=Boolean(winUsage&&typeof winUsage.observedTokens==='number'&&winUsage.observedTokens>0);
      if(forecastEl){
        hidden(forecastEl,!showF&&!showUsage);
        if(fTextEl){
          hidden(fTextEl,!showF);
          if(showF){
            if(forecast.willExhaust){
              text(`${name}-forecast-text`,t('forecastDepletes',{eta:language.shortEta(forecast.exhaustInMs),early:language.shortEta(forecast.earlyByMs)}));
              attribute(fTextEl,'data-alert','true');
            }else{
              attribute(fTextEl,'data-alert',null);
              text(`${name}-forecast-text`,forecast.warmingUp?t('forecastWarming',{pct:pct(forecast.used)}):t('forecastLeft',{pct:pct(forecast.projectedRemaining)}));
            }
          }else{
            attribute(fTextEl,'data-alert',null);
            text(`${name}-forecast-text`,'');
          }
        }
        attribute(forecastEl,'title',showF?(forecast.dailyWorkHours<24?t('forecastBasisWork',{remaining:pct(forecast.remaining),time:pct(forecast.timeRemaining),hours:forecast.dailyWorkHours}):t('forecastBasis',{remaining:pct(forecast.remaining),time:pct(forecast.timeRemaining)})):null);
      }
      attribute($(`${name}-track`),'aria-valuenow',remaining!==null?remaining*100:null);attribute($(`${name}-track`),'aria-valuemin','0');attribute($(`${name}-track`),'aria-valuemax','100');
      const isFirstWindow=window===visibleQuotaWindows[0];
      const subagentNote=composer?.kind==='subagent'&&isFirstWindow?t('accountQuota'):'';
      const windowNote=quotaError&&!group?'':b?.disabled?t('disabledQuota'):!b?.available?t('noQuota'):'';
      const note=[subagentNote,windowNote].filter(Boolean).join(' ');
      text(`${name}-note`,note);hidden($(`${name}-note`),!note);
      if(usageEl){
        hidden(usageEl,!showUsage);
        if(showUsage){
          const refText=winUsage.estimatedFullTokens?` (${t('quotaWindowFullRef',{full:compact(winUsage.estimatedFullTokens)})})`:'';
          const detailText=`${compact(winUsage.observedTokens)} ${tokUnit(winUsage.observedTokens)}${refText}`;
          text(`${name}-usage`,compact(winUsage.observedTokens));
          attribute(usageEl,'title',`${t('quotaWindowUsage')}: ${detailText} · ${t('quotaWindowBasis')}`);
        }else{
          text(`${name}-usage`,'');
          attribute(usageEl,'title',null);
        }
      }
    }
    text('quota-error',quotaError);hidden($('quota-error'),!quotaError);
    const sibWrap=$('quota-siblings');
    if(sibWrap){
      const siblings=group?groups.filter(g=>g.id!==group.id):groups;
      hidden(sibWrap,!siblings.length);
      const sibSig=JSON.stringify(siblings.map(g=>[g.id,label(g),language.quotaWindows(g),language.quotaGroupKind(g)==='gemini-argon',language.language]));
      if(sibWrap.dataset.signature!==sibSig){
        sibWrap.replaceChildren(...siblings.map(g=>{
          const btn=document.createElement('button');btn.type='button';btn.className='quota-sibling';btn.dataset.group=g.id;
          const wins=language.quotaWindows(g),sibArgon=language.quotaGroupKind(g)==='gemini-argon';
          const lbl=document.createElement('span');lbl.className='sibling-label';
          const dot=document.createElement('i');dot.className='sibling-dot';dot.setAttribute('aria-hidden','true');
          const name=document.createElement('span');name.className='sibling-name';name.textContent=label(g);
          lbl.append(dot,name);
          const metrics=document.createElement('span');metrics.className='sibling-metrics';
          for(const w of wins){
            const winEl=document.createElement('span');winEl.className='sibling-win';winEl.dataset.window=w;
            const tagEl=document.createElement('span');tagEl.className='sibling-tag';tagEl.textContent=w==='5h'?'5h':t(sibArgon?'argonWeek':'weekShort');
            const valEl=document.createElement('span');valEl.className='sibling-val';valEl.textContent='—';
            const bar=document.createElement('i');bar.className='sibling-bar';
            const fill=document.createElement('i');bar.append(fill);
            winEl.append(tagEl,valEl,bar);metrics.append(winEl);
          }
          btn.append(lbl,metrics);
          btn.addEventListener('click',()=>{
            const kb=btn.matches(':focus-visible');
            chosen=g.id===autoGroupId?null:g.id;
            render();
            if(kb)sibWrap.querySelector('.quota-sibling')?.focus({preventScroll:true});
          });
          return btn;
        }));
        sibWrap.dataset.signature=sibSig;
      }
      for(const btn of sibWrap.children){
        const g=groups.find(item=>item.id===btn.dataset.group);if(!g)continue;
        const wins=language.quotaWindows(g),sibArgon=language.quotaGroupKind(g)==='gemini-argon';
        const tipParts=[label(g)];
        for(const w of wins){
          const winEl=btn.querySelector(`.sibling-win[data-window="${w}"]`);if(!winEl)continue;
          const b=g?.windows?.[w],rem=language.quotaRemaining(b),val=b?.disabled?t('unavailableQuota'):pct(rem);
          const valEl=winEl.querySelector('.sibling-val'),fillEl=winEl.querySelector('.sibling-bar i');
          if(valEl&&valEl.textContent!==val)valEl.textContent=val;
          if(fillEl){
            style(fillEl,'width',rem!==null?`${rem*100}%`:'0%');
            style(fillEl,'background',rem!==null&&rem<.05?'var(--pulse-danger)':'');
          }
          const tag=w==='5h'?'5h':t(sibArgon?'argonWeek':'weekShort');
          tipParts.push(`${tag} ${val}`);
        }
        attribute(btn,'title',tipParts.join(' · '));
      }
    }
    // Composer quota ring: one ring for the remaining allowance of the active
    // model's group (the context ring above shows usage). Shared view logic in
    // i18n.cjs picks the painted window per quotaDisplay; unknown stays an
    // em-dash on a dashed ring, never 0%.
    const quotaChip=root.querySelector('[data-card="quota"]'),quotaArcEl=$('quota-ring-arc'),quotaTextEl=$('quota-text');
    if(quotaChip&&quotaArcEl){
      hidden(quotaChip,isRemoteFallback()?false:((!group&&!quotaError)||hiddenSet.has('quota')));
      if(group){
        const view=language.quotaRingView(group,quotaDisplay.value),RING=2*Math.PI*8;
        const ringPct=v=>`${Math.round(v*100)}%`;
        attribute(quotaArcEl,'stroke-dasharray',view.arcValue===null?'2 3':`${(RING*Math.min(1,Math.max(0,view.arcValue))).toFixed(3)} ${RING.toFixed(3)}`);
        attribute(quotaChip,'data-quota-level',view.level==='ok'?null:view.level);
        attribute(quotaChip,'data-quota-dot',view.dot);
        const tag=w=>w==='5h'?'5h':t('weekShort');
        const seg=(w,strong,secondary=false)=>{const v=w==='5h'?view.five?.remaining??null:view.week?.remaining??null;const cls=secondary?' class="quota-secondary"':'';return v!==null?`<${strong?'strong':'span'}${cls}><span class="quota-tag">${tag(w)} </span>${ringPct(v)}</${strong?'strong':'span'}>`:`<span class="dim${secondary?' quota-secondary':''}"><span class="quota-tag">${tag(w)} </span>—</span>`;};
        let html='';
        if(quotaDisplay.value==='both'){
          const parts=[],primary=view.show||'5h';
          if(view.five)parts.push(seg('5h',primary==='5h'&&view.five.remaining!==null,primary!=='5h'));
          if(view.week){if(parts.length)parts.push(`<span class="dim quota-secondary">·</span>`);parts.push(seg('weekly',primary==='weekly'&&view.week.remaining!==null,primary!=='weekly'));}
          html=parts.join('')||'<span class="dim">—</span>';
        }else if(view.show){
          const v=view.show==='5h'?view.five?.remaining??null:view.week?.remaining??null;
          const prefix=quotaDisplay.value==='compact'?'':`<span class="dim quota-tag">${tag(view.show)}</span> `;
          html=prefix+(v!==null?`<strong>${ringPct(v)}</strong>`:'<span class="dim">—</span>');
        }else html='<span class="dim">—</span>';
        if(quotaTextEl._markup!==html){quotaTextEl._markup=html;setMarkup(quotaTextEl,html);}
        const tips=[];
        if(view.five)tips.push(`5h ${t('remaining')} ${view.five.remaining!==null?ringPct(view.five.remaining):'—'}`);
        if(view.week)tips.push(`${t('weekShort')} ${t('remaining')} ${view.week.remaining!==null?ringPct(view.week.remaining):'—'}`);
        const tip=`${t('quotaRingTitle')} · ${tips.length?tips.join(' · '):t('quotaRingUnknown')}`;
        attribute(quotaChip,'title',tip);attribute(quotaChip,'aria-label',tip);
      }else if(quotaError){
        attribute(quotaArcEl,'stroke-dasharray','2 3');
        attribute(quotaChip,'data-quota-level','unknown');
        attribute(quotaChip,'data-quota-dot',null);
        const unknownHtml='<span class="dim">—</span>';
        if(quotaTextEl._markup!==unknownHtml){quotaTextEl._markup=unknownHtml;setMarkup(quotaTextEl,unknownHtml);}
        const tip=`${t('quotaRingTitle')} · ${quotaError}`;
        attribute(quotaChip,'title',tip);attribute(quotaChip,'aria-label',tip);
      }
    }
    attribute($('dot'),'class',`dot ${data.connection}`);attribute($('dot'),'title',t(data.connection==='live'?'live':data.connection==='stale'?'stale':'offline'));tick();fit();position();syncTurnFooters();
  }
  const TURN_FOOTER_STYLE_ID='ag-pulse-turn-footer-style';
  function clearTurnFooters(){
    for(const el of document.querySelectorAll('[data-ag-pulse-turn-footer]'))el.remove();
  }
  function formatTurnFooter(turn){
    if(!turn||typeof turn!=='object')return '';
    const parts=[];
    if(turn.model)parts.push(turn.multiModel?`${turn.model} +`:turn.model);
    if(Number.isSafeInteger(turn.inputTokens))parts.push(`${t('turnFooterIn')} ${compact(turn.inputTokens)}`);
    if(Number.isSafeInteger(turn.outputTokens))parts.push(`${t('turnFooterOut')} ${compact(turn.outputTokens)}`);
    if(typeof turn.hitRate==='number'&&Number.isFinite(turn.hitRate))parts.push(`${t('turnFooterCache')} ${pct(turn.hitRate)}`);
    if(typeof turn.tps==='number'&&Number.isFinite(turn.tps))parts.push(`${t('turnFooterSpeed')} ${Math.round(turn.tps)} tok/s`);
    return parts.join(' · ');
  }
  function upsertTurnFooter(toolbar,textValue){
    if(!toolbar||!textValue)return;
    let el=toolbar.querySelector(':scope > [data-ag-pulse-turn-footer]');
    let textEl,btn;
    if(!el){
      el=document.createElement('div');
      el.className='ag-pulse-turn-footer';
      el.setAttribute('data-ag-pulse-turn-footer','true');
      textEl=document.createElement('span');
      textEl.className='ag-pulse-turn-footer-text';
      btn=document.createElement('button');
      btn.type='button';
      btn.className='ag-pulse-turn-footer-settings';
      btn.setAttribute('data-ag-pulse-turn-footer-settings','true');
      btn.append(svgEl('svg',{viewBox:'0 0 16 16',width:11,height:11,fill:'none',stroke:'currentColor','stroke-width':1.5,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'},[
        svgEl('circle',{cx:8,cy:8,r:2.3}),
        svgEl('path',{d:'M13.3 8a5.3 5.3 0 0 0-.1-.9l1.4-1.1-1.3-2.2-1.7.6a5.4 5.4 0 0 0-1.5-.9L9.7 2H6.3l-.4 1.5a5.4 5.4 0 0 0-1.5.9l-1.7-.6L1.4 6l1.4 1.1a5.3 5.3 0 0 0 0 1.8L1.4 10l1.3 2.2 1.7-.6c.5.4 1 .7 1.5.9l.4 1.5h3.4l.4-1.5c.5-.2 1-.5 1.5-.9l1.7.6 1.3-2.2-1.4-1.1c.1-.3.1-.6.1-.9Z'}),
      ]));
      btn.addEventListener('click',e=>{e.stopPropagation();openSettingsModal(btn,{focusSetting:'turnFooter'});});
      el.append(textEl,btn);
      toolbar.prepend(el);
    }else{
      textEl=el.querySelector(':scope > .ag-pulse-turn-footer-text');
      btn=el.querySelector(':scope > [data-ag-pulse-turn-footer-settings]');
    }
    if(textEl&&textEl.textContent!==textValue)textEl.textContent=textValue;
    if(btn){
      const label=t('turnFooter');
      if(btn.getAttribute('aria-label')!==label)btn.setAttribute('aria-label',label);
      if(btn.getAttribute('title')!==label)btn.setAttribute('title',label);
    }
  }
  function syncTurnFooters(){
    const turns=data?.speed?.turns;
    if(disposed||instDisposed||parked||!isPrimary||!turnFooter.enabled||!data||data.connection==='offline'||!Array.isArray(turns)||!turns.length){
      if(isPrimary)clearTurnFooters();
      return;
    }
    if(!document.getElementById(TURN_FOOTER_STYLE_ID)){
      const st=document.createElement('style');
      st.id=TURN_FOOTER_STYLE_ID;
      st.textContent='.ag-pulse-turn-footer{display:flex;align-items:center;gap:4px;font-size:11px;line-height:16px;color:var(--pulse-muted,#6b7280);font-variant-numeric:tabular-nums;padding:6px 0 8px;opacity:.85;user-select:none;min-width:0}.ag-pulse-turn-footer-text{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ag-pulse-turn-footer-settings{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;padding:0;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;opacity:0;pointer-events:none;transition:opacity 120ms ease,background-color 120ms ease}.ag-pulse-turn-footer:hover .ag-pulse-turn-footer-settings,.ag-pulse-turn-footer:focus-within .ag-pulse-turn-footer-settings{opacity:.72;pointer-events:auto}.ag-pulse-turn-footer-settings:hover,.ag-pulse-turn-footer-settings:focus-visible{opacity:1;background:rgba(128,128,128,.14)}';
      (document.head||document.documentElement).append(st);
    }
    const toolbars=Array.from(document.querySelectorAll('[data-testid="cascade-system-message-toolbar"]'));
    if(!toolbars.length)return;
    const total=Number.isSafeInteger(data.speed.totalCompletedTurns)?data.speed.totalCompletedTurns:turns.length;
    if(toolbars.length===total&&turns.length===total){
      for(let i=0;i<toolbars.length;i++){
        const labelText=formatTurnFooter(turns[i]);
        if(labelText)upsertTurnFooter(toolbars[i],labelText);
        else toolbars[i].querySelector(':scope > [data-ag-pulse-turn-footer]')?.remove();
      }
      return;
    }
    const running=/RUNNING/.test(String(data.speed.status||''));
    const latestTurn=turns[turns.length-1];
    for(const tb of toolbars){
      if(!running&&latestTurn&&tb.closest('[data-turn-content="latest"]')){
        const labelText=formatTurnFooter(latestTurn);
        if(labelText)upsertTurnFooter(tb,labelText);
      }else{
        tb.querySelector(':scope > [data-ag-pulse-turn-footer]')?.remove();
      }
    }
  }
  function tick(){
    if(!root)return;
    for(const [window,name]of[['5h','five'],['weekly','week']]){const b=group?.windows?.[window];text(`${name}-timer`,timer(b?.resetAt,true));text(`${name}-countdown`,timer(b?.resetAt));if(b?.resetAt&&Date.parse(b.resetAt)<=Date.now()&&Date.now()-lastExpiredRefresh>30000){lastExpiredRefresh=Date.now();refresh(true);}}
  }
  function setQuotaBusy(busy){
    const spinner=$('quota-spinner');if(!spinner)return;
    attribute(spinner,'aria-busy',String(busy));hidden(spinner,!busy);
    attribute(spinner,'aria-label',t('refreshing'));
  }
  function hoverQuotaRefresh(){
    if(disposed||instDisposed||parked||!node?.isConnected)return null;
    if(hoverQuotaRequest)return hoverQuotaRequest.promise;
    if(manualRequest)return manualRequest.promise;
    if(Date.now()-lastQuotaHoverAt<QUOTA_HOVER_COOLDOWN)return null;
    lastQuotaHoverAt=Date.now();
    const epoch=requestEpoch,request={};hoverQuotaRequest=request;setQuotaBusy(true);
    request.promise=(async()=>{
      try{if(pending)await refreshRequest;if(!disposed&&!instDisposed&&epoch===requestEpoch)await refresh(false,false,true);}
      finally{if(hoverQuotaRequest===request){hoverQuotaRequest=null;if(!manualRequest)setQuotaBusy(false);}}
    })();
    return request.promise;
  }
  const COMPOSITION_LABELS={customization:'compositionCustomization',user:'compositionUser',thinking:'compositionThinking',reply:'compositionReply',assistant:'compositionAssistant',tool:'compositionTool',system:'compositionSystem',other:'compositionOther',remaining:'compositionRemaining',systemPrompt:'compositionSystemPrompt',mcpTools:'compositionMcpTools',subagents:'compositionSubagents',skills:'compositionSkills',plugins:'compositionPlugins',rules:'compositionRules',tools:'compositionTools',chatMessages:'compositionChatMessages'};
  const COMPOSITION_SOURCES={hybrid:'compositionSourceHybrid',transcript:'compositionSourceTranscript',steps:'compositionSourceSteps','host-token-groups':'compositionSourceHost'};
  const COMPOSITION_GROUPS={Rules:['compositionGroupRules','group-rules'],Skills:['compositionGroupSkills','group-skills'],Subagents:['compositionGroupSubagents','group-subagents'],'Mcp Tools':['compositionGroupMcpTools','group-mcp']};
  const HOST_SEGMENTS=new Set(['systemPrompt','mcpTools','subagents','skills','plugins','rules','tools','chatMessages']);
  // The panel side computes every number (issue #34); the widget only maps
  // segment ids to labels, colors and titles. The composition bar matches the
  // host usage percent because dynamic estimates are scaled panel-side.
  function renderComposition(composition,cache=null){
    const section=$('context-composition'),trendSection=$('context-trend-section'),track=$('context-track'),cacheRow=$('context-cache-row');
    const usable=Boolean(composition&&Number.isSafeInteger(composition.usedTokens)&&Number.isSafeInteger(composition.maxTokens)&&composition.maxTokens>0&&Array.isArray(composition.segments)&&composition.segments.some(segment=>segment.id!=='remaining'));
    if(track)hidden(track,usable);
    if(section)hidden(section,!usable);
    const hasHitRate=typeof cache?.hitRate==='number'&&Number.isFinite(cache.hitRate);
    if(cacheRow){hidden(cacheRow,!hasHitRate);if(hasHitRate)text('context-cache-rate',pct(cache.hitRate));}
    const trend=composition?.trend,trendOk=Boolean(trend&&Array.isArray(trend.points)&&trend.points.length>=2);
    if(trendSection)hidden(trendSection,!trendOk);
    if(usable&&section){
      const isHost=composition.source==='host-token-groups';
      const injection=composition.customization?.available?t('compositionCustomizationValue',{tokens:compact(composition.customization.tokens)}):t('compositionCustomizationValue',{tokens:'—'});
      const sourceKey=COMPOSITION_SOURCES[composition.source];
      const sourceTag=sourceKey?t(sourceKey):'';
      text('composition-source',isHost?sourceTag:[injection,sourceTag].filter(Boolean).join(' · '));
      attribute(section,'title',t('compositionBasis',{source:sourceTag||'—'}));
      for(const button of root.querySelectorAll('[data-composition-view]'))attribute(button,'aria-pressed',button.dataset.compositionView===compositionView);
      const meter=$('composition-meter'),listEl=$('composition-list'),legend=$('composition-legend');
      if(listEl)hidden(listEl,compositionView!=='list');
      if(legend)hidden(legend,compositionView!=='bar');
      const sig=JSON.stringify([composition.segments,composition.source,composition.customization?.budget??null,composition.customization?.groups??null,compositionView,language.language]);
      if(meter&&meter.dataset.signature!==sig){
        meter.dataset.signature=sig;
        const visible=composition.segments.filter(segment=>segment.fraction>0&&segment.tokens>0);
        const groups=Array.isArray(composition.customization?.groups)?composition.customization.groups:[];
        const groupSum=groups.reduce((n,g)=>n+(g.tokens>0?g.tokens:0),0);
        const expanded=[];
        for(const segment of visible){
          if(segment.id==='remaining')continue;
          if(segment.id==='customization'&&groups.length&&groupSum>0){
            for(const groupItem of groups){
              if(!(groupItem.tokens>0))continue;
              const meta=COMPOSITION_GROUPS[groupItem.name];
              expanded.push({cls:meta?meta[1]:'customization',label:meta?t(meta[0]):groupItem.name,tokens:groupItem.tokens,fraction:segment.fraction*(groupItem.tokens/groupSum),exact:true});
            }
            continue;
          }
          expanded.push({cls:segment.id,label:t(COMPOSITION_LABELS[segment.id]||'compositionTitle'),tokens:segment.tokens,fraction:segment.fraction,exact:segment.id==='customization'||HOST_SEGMENTS.has(segment.id),budget:segment.id==='customization'?composition.customization?.budget:null});
        }
        const totalFilled=expanded.reduce((n,item)=>n+item.fraction,0);
        const tipFor=item=>{
          const budget=item.budget?` / ${compact(item.budget)}`:'';
          const winPct=Number((item.fraction*100).toFixed(1));
          const kind=t(item.exact?'compositionExactTag':'compositionEstimateTag');
          return `${item.label}: ${count(item.tokens)}${budget} ${tokUnit(item.tokens)} · ${t('compositionWindowShare',{pct:winPct})} · ${kind}`;
        };
        const remainingSeg=visible.find(segment=>segment.id==='remaining');
        const meterParts=[...expanded,...(remainingSeg?[{cls:'remaining',label:t('compositionRemaining'),tokens:remainingSeg.tokens,fraction:remainingSeg.fraction,exact:false,remaining:true}]:[])];
        meter.replaceChildren(...meterParts.map(item=>{
          const bar=document.createElement('i');bar.className=`composition-seg-${item.cls}`;bar.style.width=`${Math.min(100,item.fraction*100)}%`;
          attribute(bar,'title',item.remaining?`${item.label}: ${count(item.tokens)} ${tokUnit(item.tokens)}`:tipFor(item));
          return bar;
        }));
        if(listEl){
          const sorted=[...expanded].sort((a,b)=>b.fraction-a.fraction);
          listEl.replaceChildren(...sorted.map(item=>{
            const row=document.createElement('div');row.className='composition-row';
            const left=document.createElement('span');left.className='composition-row-label';
            const dot=document.createElement('i');dot.className=`composition-row-dot composition-seg-${item.cls}`;dot.setAttribute('aria-hidden','true');
            const name=document.createElement('span');name.textContent=item.label;
            left.append(dot,name);
            const sharePct=totalFilled>0?(item.fraction/totalFilled)*100:0;
            const pctText=sharePct<0.1?'<0.1%':`${Number(sharePct.toFixed(1))}%`;
            const val=document.createElement('span');val.className='composition-row-pct';val.textContent=pctText;
            attribute(row,'title',tipFor(item));
            row.append(left,val);
            return row;
          }));
        }
        if(legend){
          legend.replaceChildren(...expanded.map(item=>{
            const chip=document.createElement('span');chip.className='composition-legend-item';
            const dot=document.createElement('i');dot.className=`composition-legend-dot composition-seg-${item.cls}`;dot.setAttribute('aria-hidden','true');
            const pctVal=Math.round(item.fraction*100),pctText=pctVal===0?'<1%':`${pctVal}%`;
            const lbl=document.createElement('span');lbl.textContent=`${item.label} ${pctText}`;
            attribute(chip,'title',tipFor(item));
            chip.append(dot,lbl);
            return chip;
          }));
        }
      }
    }
    if(!trendSection||!trendOk)return;
    const points=trend.points,W=280,H=36,P=3,max=Math.max(1,...points.map(point=>point.inputTokens||0));
    const x=index=>P+(W-2*P)*(index/(points.length-1)),y=value=>H-P-(H-2*P)*((value||0)/max);
    const svg=$('context-trend-svg'),sig=JSON.stringify([points.map(point=>point.inputTokens),trend.markers,language.language]);
    if(svg&&svg.dataset.signature!==sig){
      svg.dataset.signature=sig;
      const markers=(Array.isArray(trend.markers)?trend.markers:[]).map(marker=>{
        const at=x(Math.min(Math.max(marker.pointIndex||0,0),points.length-1));
        const label=marker.kind==='checkpoint'?t('trendCheckpoint'):t('trendCompaction');
        const tip=`${label}: ${Number.isFinite(marker.before)?count(marker.before):'—'} → ${Number.isFinite(marker.after)?count(marker.after):'—'}`;
        return svgEl('g',{class:'trend-marker-group'},[
          svgEl('title',{},[document.createTextNode(tip)]),
          svgEl('line',{class:'trend-marker',x1:at,x2:at,y1:P,y2:H-P}),
          svgEl('line',{class:'trend-marker-hit',x1:at,x2:at,y1:P,y2:H-P}),
        ]);
      });
      const path=svgEl('path',{class:'trend-line',d:`M${x(0)} ${y(points[0].inputTokens)}`+points.slice(1).map((point,index)=>`L${x(index+1)} ${y(point.inputTokens)}`).join('')});
      svg.replaceChildren(...markers,path);
    }
    text('trend-sample',t('trendSample',{n:count(trend.totalRequests??points.length)}));
    attribute(trendSection,'title',t('trendBasis'));
  }
  let contextDetailAt=0;
  // Opening the context card lazily asks for the customization token base.
  // The panel caches GetTokenBase for 10 minutes and keeps attaching the
  // cached value to later polls, so this stays quiet once satisfied.
  function contextDetailRefresh(){
    if(disposed||instDisposed||parked||!node?.isConnected)return;
    if(!data?.speed?.context)return;
    const wait=data.speed.contextComposition?.customization?.available?9*60*1000:15000;
    if(Date.now()-contextDetailAt<wait)return;
    contextDetailAt=Date.now();
    const conversation=conversationId(),model=currentComposerModel(),remoteHost=detectRemoteHost(),epoch=requestEpoch;
    void window.agPulseHost.getMetrics({conversationId:conversation,force:false,contextDetail:true,...(model?{composerModel:model}:{}),...(remoteHost?{remoteHost}:{})}).then(result=>{
      if(disposed||instDisposed||parked||epoch!==requestEpoch||!data?.speed)return;
      const next=result?.speed?.contextComposition;
      if(!next)return;
      if(conversation&&result.speed?.conversationId&&result.speed.conversationId!==conversation)return;
      data={...data,speed:{...data.speed,contextComposition:next}};
      render();
    }).catch(()=>{});
  }
  async function triggerCompact(){
    const editor=composer?.editor;
    if(!editor?.isConnected||!node?.isConnected||compactDispatching)return;
    const isRunningTurn=Boolean(data?.speed&&/RUNNING/i.test(String(data.speed.status||'')));
    if(isRunningTurn||pendingCompact||data?.speed?.compactionState==='compacting')return;
    const readText=()=>(editor.textContent||'').replace(/\u200B/g,'').trim();
    if(readText().length>0){attribute($('context-compact-btn'),'title',t('contextCompactDraftTitle'));return;}
    compactDispatching=true;
    const baseCompactions=data?.speed?.transcriptStats&&['ready','partial'].includes(data.speed.transcriptStats.status)&&typeof data.speed.transcriptStats.compactionMarkers==='number'?data.speed.transcriptStats.compactionMarkers:0;
    const baseUsedTokens=data?.speed?.context?.usedTokens??null;
    const conv=conversationId();
    try{
      hide();
      editor.focus();
      try{
        const sel=window.getSelection?.();
        if(sel){const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);sel.removeAllRanges();sel.addRange(range);}
      }catch{}
      if(typeof window.agPulseHost?.compactChat==='function'){
        const res=await window.agPulseHost.compactChat();
        if(!disposed&&!instDisposed&&res?.ok&&readText()===''){
          pendingCompact={conversationId:conv,startedAt:Date.now(),baseCompactions,baseUsedTokens};
          render();
        }
        return;
      }
      let inserted=false;
      try{inserted=Boolean(document.execCommand?.('insertText',false,'/compact'));}catch{}
      if(!inserted||readText()!=='/compact'){
        try{editor.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'/compact'}));}catch{}
      }
      if(readText()!=='/compact'){
        editor.textContent='/compact';
        try{editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'/compact'}));}catch{editor.dispatchEvent(new Event('input',{bubbles:true}));}
      }
      if(readText()!=='/compact')return;
      pendingCompact={conversationId:conv,startedAt:Date.now(),baseCompactions,baseUsedTokens};
      render();
      setTimeout(()=>{
        if(disposed||instDisposed||!editor?.isConnected)return;
        const scope=composer.box||composer.row;
        const sendBtn=scope?Array.from(scope.querySelectorAll('button')).find(b=>{
          if(node.contains(b)||b.disabled||!visible(b))return false;
          const tid=b.getAttribute('data-tooltip-id')||'';
          const testid=b.dataset?.testid||'';
          if(tid==='input-send-button-record-tooltip'||testid==='voice-start-button')return false;
          return testid==='send-button'||tid.includes('send-button')||/^(?:send|submit|发送|提交|傳送)$/i.test((b.getAttribute('aria-label')||b.title||'').trim());
        }):null;
        if(sendBtn){sendBtn.click();}
        else{editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));}
      },90);
    }finally{compactDispatching=false;}
  }
  function refreshManually(syncUsage=false){
    if(manualRequest)return manualRequest.promise;
    setQuotaBusy(true);const started=performance.now();
    const epoch=requestEpoch,request={};manualRequest=request;
    request.promise=(async()=>{
      try{if(pending)await refreshRequest;if(!disposed&&!instDisposed&&epoch===requestEpoch)await refresh(true,syncUsage);}
      finally{
        // A fast cached response still needs visible press feedback. This does
        // not delay data updates; only the indicator has a 250ms minimum.
        const remaining=250-(performance.now()-started);
        if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
        if(manualRequest===request){setQuotaBusy(false);manualRequest=null;}
      }
    })();
    return request.promise;
  }
  function refresh(force=false,syncUsage=false,quotaRefresh=false){
    if(disposed||instDisposed)return;
    if(!parked&&syncConversation())render();
    if(pending)return refreshRequest;
    if(!node?.isConnected)return;
    const conversation=parked?lastConversation:conversationId();
    const epoch=requestEpoch;
    const current=()=>!disposed&&!instDisposed&&epoch===requestEpoch&&node?.isConnected&&(parked||(conversation===conversationId()&&conversation===lastConversation));
    pending=true;lastFetch=Date.now();
    refreshRequest=(async()=>{
      const composerModel=currentComposerModel(),remoteHost=detectRemoteHost();
      try{const result=await window.agPulseHost.getMetrics({conversationId:conversation,force,...(quotaRefresh?{quotaRefresh:true}:{}),...(composerModel?{composerModel}:{}),...(remoteHost?{remoteHost}:{}),...(syncUsage?{usageSync:true}:{})});if(!current())return;if(force||quotaRefresh)lastQuotaHoverAt=Date.now();node.style.visibility=result.enabled===false?'hidden':'';if(result.enabled===false){hide();return;}if(!conversation||result.speed&&result.speed.conversationId!==conversation)result.speed=null;if(result.usage?.scope&&data?.usage?.scope===usageScope.scope&&result.usage.scope!==usageScope.scope)result.usage=data.usage;data=result;hydrated=true;if(result.preferences){syncGuide(result.preferences);preferences.sync(result.preferences);guideReady=!preferences.error;}if(Object.hasOwn(result,'theme'))themeController?.setHostTheme(result.theme);render();}
      catch{if(current()&&data){data.connection='stale';data.error=t('reconnecting');render();}}
      finally{if(epoch===requestEpoch){pending=false;refreshRequest=null;}}
    })();
    return refreshRequest;
  }
  return {
    get node(){return node;},
    get composer(){return composer;},
    get usageDashboard(){return usageDashboard;},
    get parked(){return parked;},
    get parkedKind(){return parkedKind;},
    mountTo,park,dispose,hide,fit,tick,position,updateGuide,stopDensityMotion,
    get isSettingsOpen(){return settingsOpen;},
    closeSettings:closeSettingsModal,
    setPrimary(flag,id){
      const changed=isPrimary!==flag;
      isPrimary=flag;
      if(node&&node.id!==id)node.id=id;
      if(changed)updateGuide();
    },
    onLocaleChanged(){if(root){localize();if(settingsOpen)renderSettingsModal();render();tick();position();}},
    onSpeedStyleChanged(){if(root){attribute(node,'data-speed-style',speedStyle.style);localize();paintSpeed([],'idle',0.36,false);if(settingsOpen)renderSettingsModal();render();tick();position();}},
    onQuotaDisplayChanged(){if(root){densityProbe=null;localize();if(settingsOpen)renderSettingsModal();render();position();}},
    onHostUiLocalizationChanged(){if(root){localize();if(settingsOpen)renderSettingsModal();position();}},
    onInlineCacheHitChanged(){if(root){densityProbe=null;attribute(node,'data-inline-cache-hit',inlineCacheHit.enabled?'true':'false');localize();if(settingsOpen)renderSettingsModal();render();scheduleLayout();}},
    onCacheChipModeChanged(){if(root){densityProbe=null;attribute(node,'data-cache-chip-mode',cacheChipMode.value);attribute(node,'data-inline-cache-hit',cacheChipMode.value==='tokens'?'false':'true');localize();if(settingsOpen)renderSettingsModal();render();scheduleLayout();}},
    onBarColorsChanged(){if(root){themeController?.setBarColors?.(barColorsPref.colors);localize();if(settingsOpen)renderSettingsModal();render();scheduleLayout();}},
    onThemeModeChanged(){if(root){themeController?.setThemeMode?.(themeModePref.value);localize();if(settingsOpen)renderSettingsModal();render();scheduleLayout();}},
    onCacheHitToneChanged(){if(root){attribute(node,'data-cache-hit-tone',cacheHitTone.value);localize();if(settingsOpen)renderSettingsModal();render();}},
    onCacheHitTiersChanged(){if(root){attribute(node,'data-cache-hit-tiers',cacheHitTiers.enabled?'true':'false');localize();if(settingsOpen)renderSettingsModal();render();}},
    onBarPrefsChanged(){if(root){densityProbe=null;applyBarLayout();localize();if(settingsOpen)renderSettingsModal();render();fit();tick();position();}},
    onStripModeChanged(){if(root){if(stripMode.mode==='minimal'&&cardName&&cardName!=='context')hide();localize();densityProbe=null;if(!parked&&composer){fit();position();}}},
    onBarPlacementChanged(){if(!root)return;stopDensityMotion();densityFrame=null;densityProbe=null;if(!parked&&composer)mountTo(composer);if(settingsOpen&&settingsDialog&&!settingsDialog.hidden)cardVisibility(settingsDialog,true);localize();if(settingsOpen)renderSettingsModal();if(!parked&&composer){render();fit();position();}},
    onTurnFooterChanged(){if(root){if(settingsOpen)renderSettingsModal();syncTurnFooters();}},
    syncTurnFooters,clearTurnFooters,
    get isPrimary(){return isPrimary;},
    onCompositionViewChanged(){if(root){clearTimeout(hoverTimer);hoverTimer=null;ignoreLeaveUntil=Date.now()+250;localize();render();position();}},
    onUsageScopeChanged(){if(root){render();}},
    syncUsageGuide(){usageDashboard?.syncGuideDismissed();},
    poll(){
      if(instDisposed||!node)return;
      if(!parked){fit();tick();position();}
      if((!parked&&conversationId()!==lastConversation)||Date.now()-lastFetch>(document.hidden?10000:2200))refresh();
    },
  };
  }
  function scheduleLayout(){
    if(disposed||layoutFrame!==null)return;
    layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;if(disposed)return;mount();for(const inst of instances)if(!inst.parked){inst.fit();inst.position();}});
  }
  function mount(){
    if(disposed)return;
    // A replaced instance's delayed preferences/observer callback must never
    // resurrect it. Also remove identifiable leftovers from older runtimes
    // before measuring the native toolbar or attaching live strips.
    const activeNodes=new Set(instances.map(inst=>inst.node).filter(Boolean));
    for(const orphan of document.querySelectorAll('[id^="'+ID+'"],[data-ag-pulse-bar]')){
      if(!activeNodes.has(orphan)&&['speed','cache','context'].every(name=>orphan.shadowRoot?.querySelector('.bar .chip[data-card="'+name+'"]')))orphan.remove();
    }
    const openModal=instances.find(inst=>inst.usageDashboard?.isOpen&&inst.node);
    if(openModal){
      if((!openModal.parked&&(!openModal.node.isConnected||!openModal.node.getClientRects().length))||!openModal.node.isConnected)openModal.park();
      return;
    }
    const foundList=findComposers();
    const used=new Set(),pairs=[];
    for(const found of foundList){
      const exact=instances.find(inst=>!used.has(inst)&&!inst.parked&&((found.box&&inst.composer?.box===found.box)||(inst.composer?.branch===found.branch&&inst.composer?.editor===found.editor)));
      if(exact){used.add(exact);pairs.push([exact,found]);}
      else pairs.push([null,found]);
    }
    for(const pair of pairs){
      if(pair[0])continue;
      const found=pair[1];
      const replacement=instances.find(inst=>!used.has(inst)&&(inst.parked||!inst.composer?.editor?.isConnected)&&(inst.composer?.kind||inst.parkedKind)===found.kind)
        ||instances.find(inst=>!used.has(inst)&&(inst.parked||!inst.composer?.editor?.isConnected));
      if(replacement){used.add(replacement);pair[0]=replacement;}
    }
    const nextInstances=[];
    for(const inst of instances){
      if(used.has(inst))continue;
      // Account usage does not belong to a composer lifecycle. Keep its frame
      // during reflows and park the host if the app replaces the input subtree.
      if(inst.usageDashboard?.isOpen&&inst.node){inst.park();nextInstances.push(inst);}
      else inst.dispose();
    }
    const attached=[];
    for(const [existing,found]of pairs){
      const inst=existing||createStripInstance();
      inst.mountTo(found);
      attached.push(inst);
    }
    instances.splice(0,instances.length,...attached,...nextInstances);
    const primary=attached.find(inst=>['main','ide'].includes(inst.composer?.kind)&&!(inst.composer.box||inst.composer.row).closest(PANE_BOUNDARY))||attached[0]||nextInstances[0]||null;
    let secondaryIndex=2;
    for(const inst of instances)if(inst!==primary)inst.setPrimary(false,`${ID}-${secondaryIndex++}`);
    if(primary)primary.setPrimary(true,ID);
  }
  let turnFooterTimer=0;
  const scheduleTurnFooters=()=>{if(turnFooterTimer)return;turnFooterTimer=setTimeout(()=>{turnFooterTimer=0;if(!disposed)for(const inst of instances)if(inst.isPrimary)inst.syncTurnFooters?.();},200);};
  const isInsideActiveEditor=target=>target instanceof Node&&instances.some(inst=>!inst.parked&&inst.composer?.editor&&target!==inst.composer.editor&&inst.composer.editor.contains(target));
  const observer=new MutationObserver(records=>{if(records.some(record=>!isOwnNode(record.target)&&!isInsideActiveEditor(record.target))){scheduleLayout();if(turnFooter.enabled)scheduleTurnFooters();}});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','hidden','inert','data-cascade-id','data-testid','data-tooltip-id','aria-label','role','contenteditable']});
  const onKey=e=>{if(e.key==='Escape')for(const inst of instances){inst.hide();if(inst.isSettingsOpen)inst.closeSettings?.();}}, onPointer=e=>{const path=e.composedPath();if(path.some(n=>n instanceof Element&&n.closest?.('[data-ag-pulse-turn-footer-settings]')))return;for(const inst of instances)if(inst.node&&!path.includes(inst.node)){inst.hide();inst.closeSettings?.({restoreFocus:false});}};
  const onFocus=e=>{if(!instances.length||!e.composedPath().some(isOwnNode))scheduleLayout();};
  const onMotionChange=()=>{for(const inst of instances)inst.stopDensityMotion();};
  document.addEventListener('keydown',onKey);document.addEventListener('pointerdown',onPointer);document.addEventListener('focusin',onFocus);
  window.addEventListener('resize',scheduleLayout);document.addEventListener('scroll',scheduleLayout,true);
  densityMedia.addEventListener('change',onMotionChange);
  let lastPrefCheck=0;
  const pollHostPrefs=()=>{
    if(disposed||instances.length||typeof window.agPulseHost?.getPreferences!=='function')return;
    const now=Date.now();if(now-lastPrefCheck<2500)return;
    lastPrefCheck=now;
    void window.agPulseHost.getPreferences().then(value=>{if(!disposed&&value&&!value.error){syncGuide(value);preferences.sync(value);}}).catch(()=>{});
  };
  const timerId=setInterval(()=>{mount();if(!instances.length)pollHostPrefs();for(const inst of instances)inst.poll();},1000);
  window.__agPulseDispose=()=>{
    disposed=true;hostI18nEpoch++;
    clearInterval(timerId);clearTimeout(turnFooterTimer);if(layoutFrame!==null)cancelAnimationFrame(layoutFrame);observer.disconnect();preferences.dispose();hostUiLocalization.dispose();inlineCacheHit.dispose();cacheChipMode.dispose();barColorsPref.dispose();themeModePref.dispose();cacheHitTone.dispose();barPrefs.dispose();stripMode.dispose();barPlacement.dispose();turnFooter.dispose();hostI18n?.dispose();hostSettings?.dispose();delete window.__agPulseOnPreferences;
    for(const el of document.querySelectorAll('[data-ag-pulse-turn-footer]'))el.remove();
    document.getElementById('ag-pulse-turn-footer-style')?.remove();
    for(const inst of instances.splice(0))inst.dispose();
    document.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',onPointer);document.removeEventListener('focusin',onFocus);
    document.removeEventListener('scroll',scheduleLayout,true);window.removeEventListener('resize',scheduleLayout);
    densityMedia.removeEventListener('change',onMotionChange);
    document.removeEventListener('DOMContentLoaded',mount);
    window.__agPulseInlineInstalled=false;delete window.__agPulseDispose;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
};
