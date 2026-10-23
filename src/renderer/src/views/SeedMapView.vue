<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SeedMapCapabilities, SeedMapDimension, SeedMapStructurePoint } from '@shared/types'
import { copyText, errText, getSeedMapCapabilities, getSeedMapStructures, getSeedMapTile } from '../api'

const canvas = ref<HTMLCanvasElement|null>(null)
const mapHost = ref<HTMLElement|null>(null)
const capabilities = ref<SeedMapCapabilities|null>(null)
const seed = ref('0')
const version = ref('1.21.4')
const dimension = ref<SeedMapDimension>('overworld')
const enabledStructures = ref<string[]>([])
const locateX = ref('0'), locateZ = ref('0')
const centerX = ref(0), centerZ = ref(0)
const zoomIndex = ref(2)
const active = ref(false), error = ref(''), notice = ref('')
const loadingTiles = ref(0), totalTiles = ref(0), structuresLoading = ref(false)
const mouse = ref({x:0,z:0,visible:false})
const points = ref<SeedMapStructurePoint[]>([])
const selected = ref<SeedMapStructurePoint|null>(null)

type Tile = { image:HTMLCanvasElement; touched:number }
const tiles = new Map<string,Tile>()
const inFlight = new Set<string>()
let resizeObserver:ResizeObserver|undefined, epoch=0, loadTimer=0, structureTimer=0
let drag:null|{x:number;y:number;cx:number;cz:number}=null

const scale = computed(() => capabilities.value?.scales[zoomIndex.value] ?? 16)
const availableStructures = computed(() => {
  const order = capabilities.value?.versions.map(v=>v.value) ?? []
  const selectedVersion = order.indexOf(version.value)
  return (capabilities.value?.structures ?? []).filter(item => item.dimension===dimension.value && order.indexOf(item.since)<=selectedVersion)
})
const structureDefinitions = computed(() => Object.fromEntries((capabilities.value?.structures ?? []).map(item=>[item.id,item])))
const progressText = computed(() => {
  if (!active.value) return '输入种子后开始查询'
  if (loadingTiles.value) return `正在计算地图 ${Math.max(0,totalTiles.value-loadingTiles.value)}/${totalTiles.value}`
  if (structuresLoading.value) return '正在定位建筑结构…'
  return '当前视野已加载'
})
const dimensionY = computed(() => dimension.value==='overworld'?64:dimension.value==='nether'?64:64)

function tileKey(tx:number,tz:number){return [seed.value.trim(),version.value,dimension.value,scale.value,tx,tz,dimensionY.value].join('|')}
function viewport(){
  const el=mapHost.value
  const width=el?.clientWidth||800,height=el?.clientHeight||600,b=scale.value
  return {width,height,minX:centerX.value-width*b/2,maxX:centerX.value+width*b/2,minZ:centerZ.value-height*b/2,maxZ:centerZ.value+height*b/2}
}
function toScreen(x:number,z:number){const v=viewport();return{x:(x-centerX.value)/scale.value+v.width/2,y:(z-centerZ.value)/scale.value+v.height/2}}
function fromScreen(x:number,y:number){const v=viewport();return{x:Math.round(centerX.value+(x-v.width/2)*scale.value),z:Math.round(centerZ.value+(y-v.height/2)*scale.value)}}

function decodeTile(base64:string,width:number,height:number):HTMLCanvasElement{
  const binary=atob(base64), bytes=new Uint8ClampedArray(binary.length)
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i)
  const output=document.createElement('canvas');output.width=width;output.height=height
  output.getContext('2d')!.putImageData(new ImageData(bytes,width,height),0,0)
  return output
}
function pruneTiles(){
  if(tiles.size<=180)return
  const oldest=[...tiles.entries()].sort((a,b)=>a[1].touched-b[1].touched).slice(0,tiles.size-160)
  oldest.forEach(([key])=>tiles.delete(key))
}
function draw(){
  const el=canvas.value,host=mapHost.value;if(!el||!host)return
  const dpr=Math.min(devicePixelRatio||1,2),w=host.clientWidth,h=host.clientHeight
  if(el.width!==Math.round(w*dpr)||el.height!==Math.round(h*dpr)){el.width=Math.round(w*dpr);el.height=Math.round(h*dpr);el.style.width=w+'px';el.style.height=h+'px'}
  const ctx=el.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false
  ctx.fillStyle='#162127';ctx.fillRect(0,0,w,h)
  if(active.value&&capabilities.value){
    const span=capabilities.value.tileSize*scale.value,v=viewport()
    const tx0=Math.floor(v.minX/span),tx1=Math.floor(v.maxX/span),tz0=Math.floor(v.minZ/span),tz1=Math.floor(v.maxZ/span)
    for(let tz=tz0;tz<=tz1;tz++)for(let tx=tx0;tx<=tx1;tx++){
      const key=tileKey(tx,tz),tile=tiles.get(key),screen=toScreen(tx*span,tz*span)
      if(tile){tile.touched=Date.now();ctx.drawImage(tile.image,Math.round(screen.x),Math.round(screen.y),capabilities.value.tileSize,capabilities.value.tileSize)}
      else{ctx.fillStyle='rgba(255,255,255,.025)';ctx.fillRect(Math.round(screen.x),Math.round(screen.y),capabilities.value.tileSize,capabilities.value.tileSize)}
    }
    drawGrid(ctx,w,h)
    drawMarkers(ctx,w,h)
  }else{
    ctx.fillStyle='rgba(255,255,255,.62)';ctx.font='600 16px system-ui';ctx.textAlign='center';ctx.fillText('输入世界种子并点击“生成地图”',w/2,h/2)
  }
}
function drawGrid(ctx:CanvasRenderingContext2D,w:number,h:number){
  const b=scale.value,spacing=b<=8?256:b<=32?1024:4096
  const v=viewport(),x0=Math.floor(v.minX/spacing)*spacing,z0=Math.floor(v.minZ/spacing)*spacing
  ctx.strokeStyle='rgba(255,255,255,.09)';ctx.lineWidth=1;ctx.beginPath()
  for(let x=x0;x<=v.maxX;x+=spacing){const p=toScreen(x,0);ctx.moveTo(Math.round(p.x)+.5,0);ctx.lineTo(Math.round(p.x)+.5,h)}
  for(let z=z0;z<=v.maxZ;z+=spacing){const p=toScreen(0,z);ctx.moveTo(0,Math.round(p.y)+.5);ctx.lineTo(w,Math.round(p.y)+.5)}ctx.stroke()
  const origin=toScreen(0,0);ctx.strokeStyle='rgba(255,255,255,.35)';ctx.beginPath();ctx.moveTo(origin.x,0);ctx.lineTo(origin.x,h);ctx.moveTo(0,origin.y);ctx.lineTo(w,origin.y);ctx.stroke()
}
function drawMarkers(ctx:CanvasRenderingContext2D,w:number,h:number){
  for(const point of points.value){
    const p=toScreen(point.x,point.z);if(p.x<-20||p.y<-20||p.x>w+20||p.y>h+20)continue
    const def=structureDefinitions.value[point.type];if(!def)continue
    ctx.beginPath();ctx.fillStyle=def.color;ctx.strokeStyle='rgba(15,18,22,.88)';ctx.lineWidth=2;ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.fill();ctx.stroke()
    ctx.fillStyle='#fff';ctx.font='700 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(def.symbol,p.x,p.y+.5)
  }
}

async function loadVisible(){
  if(!active.value||!capabilities.value)return
  const localEpoch=epoch,span=capabilities.value.tileSize*scale.value,v=viewport()
  const requests:Array<{tx:number;tz:number;key:string}>=[]
  for(let tz=Math.floor(v.minZ/span)-1;tz<=Math.floor(v.maxZ/span)+1;tz++)for(let tx=Math.floor(v.minX/span)-1;tx<=Math.floor(v.maxX/span)+1;tx++){
    const key=tileKey(tx,tz);if(!tiles.has(key)&&!inFlight.has(key)){inFlight.add(key);requests.push({tx,tz,key})}
  }
  totalTiles.value=requests.length;loadingTiles.value=requests.length
  await Promise.all(requests.map(async item=>{
    try{
      const result=await getSeedMapTile({seed:seed.value.trim(),version:version.value,dimension:dimension.value,x:item.tx*span,z:item.tz*span,scale:scale.value,y:dimensionY.value})
      if(localEpoch===epoch)tiles.set(item.key,{image:decodeTile(result.rgbaBase64,result.width,result.height),touched:Date.now()})
    }catch(e){if(localEpoch===epoch)error.value=errText(e)}finally{inFlight.delete(item.key);if(localEpoch===epoch){loadingTiles.value=Math.max(0,loadingTiles.value-1);draw()}}
  }))
  pruneTiles();draw()
}
async function loadStructures(){
  if(!active.value||!enabledStructures.value.length){points.value=[];draw();return}
  const localEpoch=epoch,v=viewport(),pad=Math.max(v.width,v.height)*scale.value*.12
  structuresLoading.value=true
  try{
    const result=await getSeedMapStructures({seed:seed.value.trim(),version:version.value,dimension:dimension.value,minX:Math.max(-30000000,Math.floor(v.minX-pad)),minZ:Math.max(-30000000,Math.floor(v.minZ-pad)),maxX:Math.min(30000000,Math.ceil(v.maxX+pad)),maxZ:Math.min(30000000,Math.ceil(v.maxZ+pad)),types:enabledStructures.value})
    if(localEpoch===epoch){points.value=result.items;notice.value=result.truncated?'当前范围结构过多，仅显示前 2500 个，请放大地图。':'';draw()}
  }catch(e){if(localEpoch===epoch)error.value=errText(e)}finally{if(localEpoch===epoch)structuresLoading.value=false}
}
function scheduleLoad(delay=80){clearTimeout(loadTimer);loadTimer=window.setTimeout(()=>void loadVisible(),delay);clearTimeout(structureTimer);structureTimer=window.setTimeout(()=>void loadStructures(),delay+120)}

async function generate(){
  error.value='';notice.value='';selected.value=null;epoch++;tiles.clear();points.value=[];active.value=true
  centerX.value=Number(locateX.value)||0;centerZ.value=Number(locateZ.value)||0
  await nextTick();draw();scheduleLoad(0)
}
function changeDimension(next:SeedMapDimension){dimension.value=next;enabledStructures.value=availableStructures.value.map(item=>item.id);void generate()}
function toggleStructure(id:string,checked:boolean){enabledStructures.value=checked?[...new Set([...enabledStructures.value,id])]:enabledStructures.value.filter(item=>item!==id);selected.value=null;scheduleLoad(0)}
function locate(){
  const x=Number(locateX.value),z=Number(locateZ.value)
  if(!Number.isInteger(x)||!Number.isInteger(z)||Math.abs(x)>30000000||Math.abs(z)>30000000){error.value='定位坐标必须是 ±30000000 范围内的整数';return}
  centerX.value=x;centerZ.value=z;selected.value=null;draw();scheduleLoad(0)
}
function resetCenter(){locateX.value='0';locateZ.value='0';locate()}
function pointerDown(e:PointerEvent){if(e.button!==0)return;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,cx:centerX.value,cz:centerZ.value};selected.value=null}
function pointerMove(e:PointerEvent){
  const rect=mapHost.value?.getBoundingClientRect();if(rect){const p=fromScreen(e.clientX-rect.left,e.clientY-rect.top);mouse.value={...p,visible:true}}
  if(!drag)return;centerX.value=Math.round(drag.cx-(e.clientX-drag.x)*scale.value);centerZ.value=Math.round(drag.cz-(e.clientY-drag.y)*scale.value);draw();scheduleLoad(120)
}
function pointerUp(){drag=null;scheduleLoad(0)}
function wheel(e:WheelEvent){
  if(!active.value||!capabilities.value)return;e.preventDefault();const rect=mapHost.value!.getBoundingClientRect(),px=e.clientX-rect.left,py=e.clientY-rect.top,before=fromScreen(px,py)
  const next=Math.max(0,Math.min(capabilities.value.scales.length-1,zoomIndex.value+(e.deltaY>0?1:-1)));if(next===zoomIndex.value)return
  zoomIndex.value=next;const v=viewport();centerX.value=Math.round(before.x-(px-v.width/2)*scale.value);centerZ.value=Math.round(before.z-(py-v.height/2)*scale.value);selected.value=null;draw();scheduleLoad(0)
}
function mapClick(e:MouseEvent){
  if(drag)return;const rect=mapHost.value!.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top
  let best:SeedMapStructurePoint|null=null,distance=15
  for(const point of points.value){const p=toScreen(point.x,point.z),d=Math.hypot(p.x-x,p.y-y);if(d<distance){best=point;distance=d}}
  selected.value=best;draw()
}
async function copyPoint(){if(selected.value)notice.value=await copyText(`${selected.value.x} ${selected.value.z}`)?'坐标已复制':'复制失败'}

watch(version,()=>{enabledStructures.value=availableStructures.value.map(item=>item.id);if(active.value)void generate()})
onMounted(async()=>{
  try{capabilities.value=await getSeedMapCapabilities();version.value=capabilities.value.versions.at(-1)?.value||'1.21.4';enabledStructures.value=availableStructures.value.map(item=>item.id)}catch(e){error.value=errText(e)}
  resizeObserver=new ResizeObserver(()=>{draw();scheduleLoad(120)});if(mapHost.value)resizeObserver.observe(mapHost.value);draw()
})
onBeforeUnmount(()=>{epoch++;resizeObserver?.disconnect();clearTimeout(loadTimer);clearTimeout(structureTimer)})
</script>

<template>
  <div class="seed-page">
    <header class="seed-heading"><div><h1>种子地图</h1><p>使用 Cubiomes 在本机离线计算 Java Edition 生物群系与结构</p></div><span class="engine-badge">{{capabilities?.engine||'正在加载计算引擎…'}}</span></header>
    <div class="seed-layout">
      <aside class="seed-controls card">
        <section class="world-section"><h2>世界</h2><div class="world-fields"><label>游戏版本<select v-model="version" class="input"><option v-for="item in capabilities?.versions" :key="item.value" :value="item.value">{{item.label}}</option></select></label><label>世界种子<input v-model.trim="seed" class="input" inputmode="numeric" placeholder="支持负数与 64 位整数" @keyup.enter="generate"></label></div><button class="btn btn-primary generate" @click="generate">生成地图</button></section>
        <section><h2>维度</h2><div class="dimension-tabs"><button v-for="item in capabilities?.dimensions" :key="item.value" :class="{active:dimension===item.value}" @click="changeDimension(item.value)">{{item.label}}</button></div><p class="support-note">二维生物群系切片高度：Y={{dimensionY}}。不支持的版本不会自动套用其他算法。</p></section>
        <section><h2>显示结构</h2><div v-if="availableStructures.length" class="structure-list"><label v-for="item in availableStructures" :key="item.id"><input type="checkbox" :checked="enabledStructures.includes(item.id)" @change="toggleStructure(item.id,($event.target as HTMLInputElement).checked)"><i :style="{background:item.color}">{{item.symbol}}</i><span>{{item.label}}<small v-if="item.predicted">预测</small></span></label></div><p v-else class="support-note">此维度和版本暂无可显示结构。</p></section>
        <section><h2>坐标定位</h2><div class="coordinate-row"><label>X<input v-model="locateX" class="input" inputmode="numeric"></label><label>Z<input v-model="locateZ" class="input" inputmode="numeric"></label></div><div class="locate-actions"><button class="btn" @click="locate">定位</button><button class="btn btn-ghost" @click="resetCenter">回到原点</button></div></section>
      </aside>
      <main ref="mapHost" class="seed-map card" :class="{dragging:!!drag}" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @pointerleave="mouse.visible=false" @wheel="wheel" @click="mapClick">
        <canvas ref="canvas" aria-label="Minecraft 种子地图"></canvas>
        <div class="map-top"><span>{{progressText}}</span><span>1 像素 = {{scale}} 方块</span></div>
        <div v-if="mouse.visible" class="mouse-coordinate">X {{mouse.x}} · Z {{mouse.z}}</div>
        <div class="map-center" aria-hidden="true"></div>
        <div v-if="selected" class="structure-popup" :style="{left:Math.max(12,Math.min((mapHost?.clientWidth||800)-230,toScreen(selected.x,selected.z).x+14))+'px',top:Math.max(54,Math.min((mapHost?.clientHeight||600)-132,toScreen(selected.x,selected.z).y+14))+'px'}" @pointerdown.stop>
          <strong>{{structureDefinitions[selected.type]?.label||selected.type}}</strong><span>X {{selected.x}} · Z {{selected.z}}</span><small v-if="selected.predicted">受地形生成影响，位置为 Cubiomes 预测</small><button class="btn btn-sm" @click="copyPoint">复制坐标</button>
        </div>
        <div v-if="error" class="map-error"><strong>地图加载失败</strong><span>{{error}}</span><button class="btn btn-sm" @click="generate">重试</button></div>
        <div v-if="notice" class="map-notice">{{notice}}</div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.seed-page{height:100%;min-height:0;display:flex;flex-direction:column;gap:12px;padding:16px 22px 20px;overflow:hidden}.seed-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-shrink:0}.seed-heading h1{font-size:26px;margin:0 0 3px}.seed-heading p{font-size:12px;color:var(--text-dim)}.engine-badge{font-size:11px;color:var(--text-dim);border:1px solid var(--border);background:var(--card);border-radius:999px;padding:6px 10px}.seed-layout{display:grid;grid-template-columns:350px minmax(0,1fr);gap:14px;min-height:0;flex:1}.card{border:1px solid var(--border);background:var(--card);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}.seed-controls{overflow:hidden;padding:14px;display:flex;flex-direction:column;gap:10px}.seed-controls section{display:flex;flex-direction:column;gap:7px}.seed-controls section+section{border-top:1px solid var(--border);padding-top:10px}.seed-controls h2{font-size:13px;margin:0}.seed-controls label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-dim)}.world-fields{display:grid;grid-template-columns:124px minmax(0,1fr);gap:8px}.input{width:100%;height:34px;border:1px solid var(--border);border-radius:9px;background:var(--card-2);color:var(--text);padding:0 9px;outline:none}.input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}.generate{width:100%;height:34px}.dimension-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:var(--card-2);padding:3px;border-radius:10px}.dimension-tabs button{height:28px;border:0;border-radius:7px;background:transparent;color:var(--text-dim);cursor:pointer}.dimension-tabs button.active{background:var(--accent);color:var(--on-accent);font-weight:700}.support-note{font-size:10px;line-height:1.35;color:var(--text-dim)}.structure-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 8px}.structure-list label{display:grid;grid-template-columns:18px 22px minmax(0,1fr);align-items:center;gap:5px;min-height:27px;cursor:pointer}.structure-list i{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;font-style:normal;font-size:9px;color:white;font-weight:700}.structure-list span{color:var(--text);font-size:11px;white-space:nowrap}.structure-list small{margin-left:3px;padding:1px 3px;border-radius:4px;background:var(--accent-soft);color:var(--accent);font-size:8px}.coordinate-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.locate-actions{display:flex;gap:7px}.locate-actions .btn{flex:1;height:32px}.seed-map{position:relative;min-width:0;min-height:400px;touch-action:none;cursor:grab;user-select:none;background:#162127}.seed-map.dragging{cursor:grabbing}.seed-map canvas{position:absolute;inset:0;width:100%;height:100%}.map-top{position:absolute;left:14px;right:14px;top:14px;display:flex;justify-content:space-between;pointer-events:none}.map-top span,.mouse-coordinate{padding:7px 10px;border:1px solid rgba(255,255,255,.16);background:rgba(13,17,22,.76);backdrop-filter:blur(10px);border-radius:9px;color:#eef2f3;font-size:11px}.mouse-coordinate{position:absolute;left:14px;bottom:14px}.map-center{position:absolute;left:50%;top:50%;width:14px;height:14px;border:1px solid rgba(255,255,255,.85);border-radius:50%;transform:translate(-50%,-50%);pointer-events:none}.map-center:before,.map-center:after{content:'';position:absolute;background:rgba(255,255,255,.85)}.map-center:before{width:1px;height:20px;left:6px;top:-4px}.map-center:after{height:1px;width:20px;left:-4px;top:6px}.structure-popup{position:absolute;width:216px;display:flex;flex-direction:column;gap:7px;padding:13px;background:color-mix(in srgb,var(--card) 92%,#111);border:1px solid var(--border-strong);border-radius:12px;box-shadow:var(--shadow-lg);z-index:3}.structure-popup strong{font-size:14px}.structure-popup span{font-size:13px}.structure-popup small{font-size:11px;line-height:1.4;color:#e6b66b}.map-error{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(390px,calc(100% - 40px));padding:18px;border-radius:14px;border:1px solid var(--danger-border);background:color-mix(in srgb,var(--card) 94%,transparent);display:flex;flex-direction:column;gap:8px;box-shadow:var(--shadow-lg)}.map-error strong{color:var(--danger)}.map-error span{font-size:12px;line-height:1.5;user-select:text}.map-notice{position:absolute;right:14px;bottom:14px;max-width:390px;padding:8px 11px;background:rgba(13,17,22,.78);border-radius:9px;color:#fff;font-size:11px}@media(max-width:1050px){.seed-layout{grid-template-columns:300px minmax(0,1fr)}.world-fields{grid-template-columns:110px minmax(0,1fr)}.structure-list{grid-template-columns:1fr}.structure-list label{min-height:24px}}@media(max-width:720px){.seed-heading{align-items:flex-start;flex-direction:column}.engine-badge{display:none}.seed-layout{grid-template-columns:1fr;grid-template-rows:auto minmax(400px,1fr)}.seed-controls{overflow:auto;max-height:300px}.seed-page{overflow:auto;height:auto}.seed-map{height:500px}}
</style>
