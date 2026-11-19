const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react');
const jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'..');
function load(file,deps,context={}){const exports={};const source=fs.readFileSync(path.join(root,file),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{exports,URL,AbortController,console,...context,require:name=>{assert(name in deps,`Missing fixture dependency ${name}`);return deps[name];}});return exports;}
const shared=load('../shared/home-banners.ts',{'./switch-campaign':{SWITCH_PATH:'/settings/plan/switch-to-clover'}});
for(const value of ['/settings/plan','/settings/plan?source=home_banner&banner=bank-sync','/settings/plan/switch-to-clover','/accounts'])assert(shared.validHomeBannerHref(value));
for(const value of ['https://evil.test','//evil.test','javascript:alert(1)','/accounts\\evil','/accounts/../settings/plan','/%2f%2fevil','/unknown','/accounts#token=secret','/accounts?x=<script>'])assert(!shared.validHomeBannerHref(value),value);
assert.equal(shared.HOME_BANNER_INTERVAL_MS,5000);assert.equal(shared.nextHomeBanner(1,2),0);assert.equal(shared.nextHomeBanner(0,1),0);
for(const tier of ['pro','premium','unknown',''])assert.equal(shared.visibleHomeBanners(shared.DEFAULT_HOME_BANNERS,tier,true).length,0);
assert.equal(shared.visibleHomeBanners(shared.DEFAULT_HOME_BANNERS,'free',false).length,1);
assert.equal(shared.visibleHomeBanners([...shared.DEFAULT_HOME_BANNERS].reverse(),'free',true)[0].id,'switch-to-clover');
assert.equal(shared.visibleHomeBanners(shared.DEFAULT_HOME_BANNERS.map(x=>({...x,enabled:false})),'free',true).length,0);
assert.equal(shared.nativeHomeBannerDestination('/settings/plan?source=home_banner').native,'/settings?section=plan');assert.equal(shared.nativeHomeBannerDestination('/settings/plan/switch-to-clover').web,'/settings/plan/switch-to-clover');
function harness({mobile=true,motion=false,banners=shared.visibleHomeBanners(shared.DEFAULT_HOME_BANNERS,'free',true)}={}){
 const state=[],refs=[],effects=[],pending=[],timers=new Map(),events=new Map(),docEvents=new Map();let index=0,ri=0,ei=0,nextTimer=0,calls=0,payload=banners;
 const track={clientWidth:358,scrollLeft:0,scrolls:[],scrollTo(value){this.scrolls.push(value);this.scrollLeft=value.left;}};
 const hooks={useState(value){const id=index++;if(!(id in state))state[id]=typeof value==='function'?value():value;return[state[id],next=>{state[id]=typeof next==='function'?next(state[id]):next;}];},useRef(value){const id=ri++;return refs[id]??=( {current:value} );},useCallback:fn=>fn,useEffect(fn,deps){const id=ei++;if(!effects[id]||deps.some((d,i)=>!Object.is(d,effects[id].deps[i]))){const old=effects[id];effects[id]={deps};pending.push(()=>{old?.cleanup?.();effects[id].cleanup=fn();});}}};
 const add=(map)=>(name,fn)=>{if(!map.has(name))map.set(name,new Set());map.get(name).add(fn);},remove=(map)=>(name,fn)=>map.get(name)?.delete(fn);
 const document={visibilityState:'visible',addEventListener:add(docEvents),removeEventListener:remove(docEvents)};
 const window={matchMedia:q=>({matches:q.includes('max-width')?mobile:motion,addEventListener(){},removeEventListener(){}}),addEventListener:add(events),removeEventListener:remove(events),setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),ResizeObserver:class{observe(){}disconnect(){}}};
 const {FreeHomeBanners,HomeBannerCard}=load('components/free-home-banners.tsx',{'react':hooks,'react/jsx-runtime':jsx,'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'../../shared/home-banners':shared,'@/lib/navigation-icons':{getNavigationIconSrc:n=>`/icons/${n}.png`},'./posthog-analytics':{capturePostHogClientEvent(){}},'./free-home-banners.module.css':{default:new Proxy({},{get:(_,key)=>String(key)})}},{window,document,ResizeObserver:window.ResizeObserver,fetch:async(_url,options)=>{calls++;return{ok:true,json:async()=>({banners:payload})};}});
 const render=()=>{index=ri=ei=0;const tree=FreeHomeBanners();refs[0].current=track;while(pending.length)pending.shift()();return tree;};
 const nodes=(tree,predicate)=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(t=>nodes(t,predicate)):[...(predicate(tree)?[tree]:[]),...nodes(tree.props?.children,predicate)];
 return {render,nodes,timers,track,document,events,docEvents,HomeBannerCard,get calls(){return calls;},emit(name){for(const fn of events.get(name)??[])fn();},emitDoc(name){for(const fn of docEvents.get(name)??[])fn();},setPayload(value){payload=value;},tick(){const[id,t]=[...timers][0]??[];assert(t,'Expected rotation timer');assert.equal(t.delay,5000);timers.delete(id);t.fn();},unmount(){for(const effect of effects)effect?.cleanup?.();}};
}
(async()=>{
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 let h=harness();h.render();h.render();await flush();let tree=h.render();assert.equal(h.calls,1);assert.equal(h.timers.size,1);h.tick();h.render();assert.equal(h.track.scrolls.at(-1).left,358);h.tick();h.render();assert.equal(h.track.scrolls.at(-1).left,0,'Last offer loops to first');
 tree=h.render();tree.props.onPointerEnter({pointerType:"touch"});h.render();assert.equal(h.timers.size,1,"Touch does not create a sticky mouse-hover pause");tree.props.onPointerEnter({pointerType:"mouse"});h.render();assert.equal(h.timers.size,0);tree.props.onPointerLeave({pointerType:"mouse"});h.render();assert.equal(h.timers.size,1);
 h.document.visibilityState='hidden';h.emitDoc('visibilitychange');h.render();assert.equal(h.timers.size,0);h.document.visibilityState='visible';h.emitDoc('visibilitychange');h.render();assert.equal(h.timers.size,1);
 tree=h.render();const trackNode=h.nodes(tree,n=>n.props?.className==='track')[0];trackNode.props.onPointerDown();h.render();assert.equal(h.timers.size,0);h.emit('pointerup');h.render();assert.equal(h.timers.size,1,'Pointer release outside the carousel resumes safely');
 tree=h.render();h.nodes(tree,n=>n.props?.className==='pause')[0].props.onClick();h.render();assert.equal(h.timers.size,0);h.nodes(h.render(),n=>n.props?.className==='pause')[0].props.onClick();h.render();assert.equal(h.timers.size,1);
 h.setPayload([]);h.emit('focus');await flush();assert.equal(h.render(),null,'Paid/removed offers disappear after access refresh');assert.equal(h.timers.size,0);h.unmount();assert([...h.events.values()].every(s=>!s.size));
 h=harness({mobile:false});h.render();assert.equal(h.render(),null);assert.equal(h.calls,0);h.unmount();
 h=harness({motion:true});h.render();h.render();await flush();tree=h.render();assert.equal(h.timers.size,0);assert.equal(h.nodes(tree,n=>n.props?.className==='pause')[0].props.disabled,true);h.unmount();
 h=harness({banners:shared.visibleHomeBanners(shared.DEFAULT_HOME_BANNERS,'free',false)});h.render();h.render();await flush();tree=h.render();assert.equal(h.timers.size,0);assert.equal(h.nodes(tree,n=>n.props?.className==='controls').length,0);h.unmount();
 const html=renderToStaticMarkup(React.createElement(h.HomeBannerCard,{banner:{...shared.DEFAULT_HOME_BANNERS[0],imageUrl:null,title:'<script>bad</script>'}}));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));
 console.log('PASS Home banners: Free gate, campaign availability, stable order, safe links, native Plan mapping, actual web 5s loop, swipe/pointer/background/hover/pause lifecycle, paid refresh, desktop exclusion, reduced motion, one-banner behavior, cleanup and escaping.');
})().catch(error=>{console.error(error);process.exitCode=1;});

// Execute the native component with its real callbacks; no package or simulator claim.
(async()=>{
 const state=[],refs=[],effects=[],callbacks=[],pending=[],timers=new Map(),appListeners=new Set(),routes=[],webLinks=[];let si=0,ri=0,ei=0,ci=0,timerId=0,calls=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const hooks={useState(value){const id=si++;if(!(id in state))state[id]=typeof value==='function'?value():value;return[state[id],next=>{state[id]=typeof next==='function'?next(state[id]):next;}];},useRef(value){return refs[ri++]??=( {current:value} );},useCallback(fn,deps){const id=ci++;if(!callbacks[id]||!same(callbacks[id].deps,deps))callbacks[id]={fn,deps};return callbacks[id].fn;},useEffect(fn,deps){const id=ei++;if(!effects[id]||!same(effects[id].deps,deps)){const old=effects[id];effects[id]={deps};pending.push(()=>{old?.cleanup?.();effects[id].cleanup=fn();});}}};
 let reduceMotion=false;
 const session={profileId:'qa',demo:false,data:{entitlement:{planTier:'free'}},request:async(path,options)=>{assert.equal(path,'home-banners');calls++;return{banners:shared.visibleHomeBanners(shared.DEFAULT_HOME_BANNERS,'free',true)};}};
 const track={scrolls:[],scrollTo(value){this.scrolls.push(value);}};
 const {FreeHomeBanners}=load('../mobile/src/free-home-banners.tsx',{'react':hooks,'react/jsx-runtime':jsx,'react-native':{View:'View',ScrollView:'ScrollView',Pressable:'Pressable',Image:'Image',AppState:{currentState:'active',addEventListener(_name,fn){appListeners.add(fn);return{remove:()=>appListeners.delete(fn)};}}},'expo-linear-gradient':{LinearGradient:'LinearGradient'},'expo-router':{router:{push:value=>routes.push(value)},useFocusEffect:fn=>hooks.useEffect(fn,[fn])},'expo-web-browser':{openBrowserAsync:async url=>webLinks.push(url)},'./session':{useSession:()=>session},'./accessibility-preferences':{useAccessibilityPreferences:()=>({reduceMotion})},'./app-text':{Text:'Text'},'./api-base':{apiBase:()=> 'https://staging.clover.ph'},'../../shared/analytics':{telemetry(){}},'../../shared/home-banners':shared},{setTimeout(fn,delay){assert.equal(delay,5000);const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 const nodes=(tree,predicate)=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(t=>nodes(t,predicate)):[...(predicate(tree)?[tree]:[]),...nodes(tree.props?.children,predicate)];
 const render=()=>{si=ri=ei=ci=0;const tree=FreeHomeBanners();refs[0].current=track;while(pending.length)pending.shift()();return tree;};
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 render();await flush();let tree=render();tree.props.onLayout({nativeEvent:{layout:{width:358}}});tree=render();assert.equal(calls,1);assert.equal(timers.size,1);
 const tick=()=>{const[id,fn]=[...timers][0];timers.delete(id);fn();render();};tick();assert.equal(track.scrolls.at(-1).x,358);tick();assert.equal(track.scrolls.at(-1).x,0,'Native carousel loops');
 tree=render();const links=nodes(tree,n=>n.props?.accessibilityRole==='link');links[0].props.onPress();await flush();assert.equal(routes.at(-1),'/settings?section=plan');links[1].props.onPress();await flush();assert.equal(webLinks.at(-1),'https://staging.clover.ph/settings/plan/switch-to-clover');
 for(const fn of appListeners)fn('background');render();assert.equal(timers.size,0);for(const fn of appListeners)fn('active');await flush();render();assert.equal(timers.size,1);
 reduceMotion=true;tree=render();assert.equal(timers.size,0);assert(nodes(tree,n=>n.props?.accessibilityLabel==='Play rotating offers')[0].props.disabled);
 session.data.entitlement.planTier='pro';assert.equal(render(),null);assert.equal(timers.size,0);for(const effect of effects)effect?.cleanup?.();assert.equal(appListeners.size,0);
 console.log('PASS native Home banners source: real 5s loop, Plan route, campaign form destination, background refresh, reduced motion, paid exclusion and cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
