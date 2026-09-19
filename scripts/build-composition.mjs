import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const story = JSON.parse(fs.readFileSync("content/story.json", "utf8"));
const assetDir = path.resolve("assets/hyeonu-taemong");
const audioDir = path.resolve("audio/scenes");
fs.mkdirSync("audio", { recursive: true });
fs.mkdirSync("renders", { recursive: true });

function probe(file) {
  return Number(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",file], { encoding:"utf8" }).trim());
}
function html(value) {
  return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
function imageFor(scene) {
  for (const name of scene.image) {
    if (fs.existsSync(path.join(assetDir, name))) return "./assets/hyeonu-taemong/" + name;
  }
  throw new Error("Missing image for " + scene.id + ": " + scene.image.join(", "));
}

const audioScenes = [];
for (let i = 0; i < story.scenes.length; i += 1) {
  const scene = story.scenes[i];
  if (!scene.narration) continue;
  const filename = String(i).padStart(2, "0") + "-" + scene.id + ".wav";
  const file = path.join(audioDir, filename);
  if (!fs.existsSync(file)) throw new Error("Missing TTS file: " + file);
  audioScenes.push({ index:i, file, duration:probe(file) });
}

fs.writeFileSync("audio/concat.txt", audioScenes.map((item) => "file \'" + item.file + "\'").join("\n") + "\n");
execFileSync("ffmpeg", ["-y","-f","concat","-safe","0","-i","audio/concat.txt","-c:a","pcm_s16le","audio/narration.wav"], { stdio:"inherit" });
const narrationDuration = probe("audio/narration.wav");

const intro = story.introDuration;
const tail = story.tailDuration;
const overlap = story.transitionDuration;
const effectHold = story.effectHoldDuration ?? 0.4;
let cursor = intro;
const timings = [];
for (let i = 0; i < story.scenes.length; i += 1) {
  const scene = story.scenes[i];
  if (!scene.narration) {
    timings.push({ index:i, id:scene.id, audioStart:0, audioDuration:intro, audioEnd:intro, visualStart:0, visualEnd:intro + overlap });
    continue;
  }
  const audio = audioScenes.find((item) => item.index === i);
  const audioStart = cursor;
  const audioEnd = audioStart + audio.duration;
  timings.push({ index:i, id:scene.id, audioStart, audioDuration:audio.duration, audioEnd, visualStart:Math.max(0,audioStart-overlap), visualEnd:audioEnd+overlap });
  cursor = audioEnd;
}
const totalDuration = intro + narrationDuration + tail;

const captions = [];
for (const timing of timings) {
  const scene = story.scenes[timing.index];
  if (!scene.captions?.length || !scene.narration) continue;
  const weights = scene.captions.map((text) => Math.max(8,[...text].length));
  const sum = weights.reduce((a,b) => a+b,0);
  let local = 0;
  scene.captions.forEach((text, idx) => {
    const duration = timing.audioDuration * weights[idx] / sum;
    captions.push({ id:"caption-"+timing.index+"-"+idx, text, start:timing.audioStart+local, duration, position:scene.captionPosition || "bottom" });
    local += duration;
  });
}

const particles = Array.from({length:24}, (_,i) => {
  const x=8+((i*37)%84), y=10+((i*53)%80), s=4+((i*7)%10), d=(i%7)*0.13;
  return '<i style="left:'+x+'%;top:'+y+'%;width:'+s+'px;height:'+s+'px;--delay:'+d+'s"></i>';
}).join("");

const scenesHtml = timings.map((t) => {
  const scene = story.scenes[t.index];
  const duration = t.visualEnd - t.visualStart;
  const gold = ["gold","transformation"].includes(scene.mood) ? '<div class="gold-aura"></div><div class="gold-particles">'+particles+'</div>' : "";
  return '<div id="'+scene.id+'" class="scene clip mood-'+scene.mood+'" data-start="'+t.visualStart.toFixed(3)+'" data-duration="'+duration.toFixed(3)+'" data-track-index="0" style="opacity:0"><div class="camera"><img class="photo" src="'+imageFor(scene)+'" alt=""></div>'+gold+'<div class="vignette"></div><div class="grain"></div></div>';
}).join("\n");

const captionsHtml = captions.map((c) => '<div id="'+c.id+'" class="caption clip caption-'+c.position+'" data-start="'+c.start.toFixed(3)+'" data-duration="'+c.duration.toFixed(3)+'" data-track-index="3" style="opacity:0"><span>'+html(c.text)+'</span></div>').join("\n");

const motion = [];
for (const t of timings) {
  const scene = story.scenes[t.index];
  const c = scene.camera;
  const dur = t.visualEnd - t.visualStart;
  const fade = Math.min(overlap, dur/3);
  const id = "#" + scene.id;
  motion.push('tl.to("'+id+'",{opacity:1,duration:'+fade.toFixed(3)+',ease:"power2.out"},'+t.visualStart.toFixed(3)+');');
  motion.push('tl.fromTo("'+id+' .photo",{scale:'+c.fromScale+',x:'+c.fromX+',y:'+c.fromY+',transformOrigin:"'+c.origin+'"},{scale:'+c.toScale+',x:'+c.toX+',y:'+c.toY+',duration:'+dur.toFixed(3)+',ease:"sine.inOut"},'+t.visualStart.toFixed(3)+');');
  if (["gold","transformation"].includes(scene.mood)) {
    motion.push('tl.fromTo("'+id+' .gold-aura",{opacity:0},{opacity:.76,duration:1.55,ease:"power2.out"},'+t.visualStart.toFixed(3)+');');
    motion.push('tl.to("'+id+' .gold-aura",{opacity:.76,duration:'+effectHold.toFixed(3)+'},'+(t.visualStart+1.55).toFixed(3)+');');
  }
  if (scene.mood === "bite") {
    const biteAt = t.audioStart + t.audioDuration*0.48;
    motion.push('tl.to("'+id+' .camera",{x:13,y:-6,duration:.055,repeat:5,yoyo:true,ease:"none"},'+biteAt.toFixed(3)+');');
    motion.push('tl.fromTo("#impact-flash",{opacity:0},{opacity:.88,duration:.08,yoyo:true,repeat:1,ease:"none"},'+biteAt.toFixed(3)+');');
  }
  motion.push('tl.to("'+id+'",{opacity:0,duration:'+fade.toFixed(3)+',ease:"power2.in"},'+Math.max(t.visualStart,t.visualEnd-fade).toFixed(3)+');');
}
for (const c of captions) {
  const f=Math.min(.22,c.duration/4);
  motion.push('tl.to("#'+c.id+'",{opacity:1,y:0,duration:'+f.toFixed(3)+',ease:"power2.out"},'+c.start.toFixed(3)+');');
  motion.push('tl.to("#'+c.id+'",{opacity:0,y:-6,duration:'+f.toFixed(3)+',ease:"power2.in"},'+(c.start+c.duration-f).toFixed(3)+');');
}

const s6=timings.find((x)=>x.id==="scene-6"), s7=timings.find((x)=>x.id==="scene-7"), ending=timings.find((x)=>x.id==="ending");
if (s6) motion.push('tl.fromTo("#dream-glow",{opacity:0},{opacity:.38,duration:1.8,ease:"sine.inOut"},'+s6.visualStart.toFixed(3)+');');
if (s7) {
  motion.push('tl.to("#dream-glow",{opacity:.75,duration:1.35,ease:"power2.inOut"},'+Math.max(0,s7.visualStart-.75).toFixed(3)+');');
  motion.push('tl.fromTo("#white-flash",{opacity:0},{opacity:.98,duration:.34,ease:"power2.inOut"},'+Math.max(0,s7.audioStart-.35).toFixed(3)+');');
  motion.push('tl.to("#white-flash",{opacity:.98,duration:'+effectHold.toFixed(3)+'},'+Math.max(0,s7.audioStart-.01).toFixed(3)+');');
  motion.push('tl.to("#white-flash",{opacity:0,duration:.5,ease:"power2.out"},'+(s7.audioStart+effectHold).toFixed(3)+');');
}
if (ending) {
  motion.push('tl.fromTo("#warm-dissolve",{opacity:0},{opacity:.64,duration:1.15,ease:"sine.inOut"},'+Math.max(0,ending.visualStart-.55).toFixed(3)+');');
  motion.push('tl.to("#warm-dissolve",{opacity:.64,duration:'+effectHold.toFixed(3)+'},'+Math.max(0,ending.visualStart+.6).toFixed(3)+');');
  motion.push('tl.to("#warm-dissolve",{opacity:0,duration:1.05,ease:"sine.out"},'+Math.max(0,ending.visualStart+.6+effectHold).toFixed(3)+');');
  motion.push('tl.to("#ending .photo",{scale:1.13,x:0,y:8,duration:'+(ending.audioDuration*.26).toFixed(3)+',ease:"sine.inOut"},'+ending.audioStart.toFixed(3)+');');
  motion.push('tl.to("#ending .photo",{scale:1.06,x:-8,y:-20,duration:'+(ending.audioDuration*.26).toFixed(3)+',ease:"sine.inOut"},'+(ending.audioStart+ending.audioDuration*.26).toFixed(3)+');');
  motion.push('tl.to("#ending .photo",{scale:1.12,x:0,y:-44,duration:'+(ending.audioDuration*.22).toFixed(3)+',ease:"sine.inOut"},'+(ending.audioStart+ending.audioDuration*.52).toFixed(3)+');');
  motion.push('tl.to("#ending .photo",{scale:1,x:0,y:0,duration:'+(ending.audioDuration*.26).toFixed(3)+',ease:"sine.inOut"},'+(ending.audioStart+ending.audioDuration*.74).toFixed(3)+');');
}

const css = `
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600&family=Noto+Serif+KR:wght@600;700&display=swap");
*{box-sizing:border-box} html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#05070d}
#stage{position:relative;width:1080px;height:1920px;overflow:hidden;background:#05070d;color:#fff;font-family:"Noto Sans KR",sans-serif}
.scene{position:absolute;inset:0;overflow:hidden;background:#05070d;will-change:opacity}
.camera{position:absolute;inset:-3%;overflow:hidden;will-change:transform}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;will-change:transform;filter:saturate(1.04) contrast(1.03)}
.vignette{position:absolute;inset:0;z-index:4;background:radial-gradient(ellipse at 50% 45%,transparent 48%,rgba(3,5,12,.12) 70%,rgba(2,4,10,.48) 100%)}
.grain{position:absolute;inset:-20%;z-index:5;opacity:.08;background:repeating-radial-gradient(circle at 20% 30%,rgba(255,255,255,.25) 0 1px,transparent 1px 4px);mix-blend-mode:soft-light;transform:rotate(7deg)}
.caption{position:absolute;left:8%;right:8%;z-index:40;text-align:center;font-size:54px;line-height:1.42;font-weight:600;letter-spacing:-.03em;text-shadow:0 3px 16px rgba(0,0,0,.75),0 1px 3px rgba(0,0,0,.9);transform:translateY(8px)}
.caption span{display:inline;padding:.16em .34em .22em;background:linear-gradient(90deg,rgba(2,4,10,.08),rgba(2,4,10,.34),rgba(2,4,10,.08));border-radius:18px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.caption-bottom{bottom:122px}.caption-top{top:116px}
#cover-title{position:absolute;left:0;right:0;bottom:175px;z-index:30;text-align:center;font-family:"Noto Serif KR",serif;font-size:112px;line-height:1.08;font-weight:700;letter-spacing:-.045em;color:#fff9ed;text-shadow:0 6px 34px rgba(0,0,0,.62),0 0 28px rgba(255,218,151,.22)}
#cover-kicker{display:block;margin-bottom:22px;font-family:"Noto Sans KR",sans-serif;font-size:24px;font-weight:500;letter-spacing:.18em;opacity:.72}
#white-flash,#impact-flash,#warm-dissolve,#dream-glow,#moon-bloom{position:absolute;inset:0;z-index:32;pointer-events:none;opacity:0}
#white-flash{background:white}#impact-flash{background:radial-gradient(circle at 62% 74%,rgba(255,223,154,.96),rgba(255,164,69,.25) 20%,transparent 58%)}
#warm-dissolve{background:radial-gradient(circle at 50% 50%,rgba(255,244,211,.94),rgba(255,201,122,.42) 42%,rgba(95,51,20,.08) 70%,transparent 100%)}
#dream-glow{background:radial-gradient(circle at 72% 45%,rgba(255,199,96,.52),rgba(255,141,41,.12) 36%,transparent 68%);mix-blend-mode:screen}
#moon-bloom{background:radial-gradient(circle at 55% 18%,rgba(237,244,255,.44),rgba(170,200,255,.12) 22%,transparent 48%);mix-blend-mode:screen}
.gold-aura{position:absolute;inset:-10%;z-index:2;opacity:0;background:radial-gradient(circle at 67% 48%,rgba(255,221,137,.92),rgba(255,173,54,.28) 26%,transparent 60%);filter:blur(18px);mix-blend-mode:screen}
.gold-particles{position:absolute;inset:0;z-index:7;pointer-events:none;overflow:hidden}.gold-particles i{position:absolute;border-radius:999px;background:radial-gradient(circle,#fff6cd 0 20%,#ffcb65 36%,rgba(255,160,32,.12) 68%,transparent 72%);box-shadow:0 0 18px rgba(255,193,74,.76);animation:float 3.2s ease-in-out infinite alternate;animation-delay:var(--delay)}
@keyframes float{from{transform:translate3d(-6px,10px,0) scale(.72);opacity:.12}to{transform:translate3d(12px,-22px,0) scale(1.18);opacity:.88}}
.mood-bite .vignette{background:radial-gradient(circle at 63% 72%,transparent 35%,rgba(0,0,0,.54) 100%)}
`;

const doc = '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=1080,height=1920"><title>'+html(story.title)+'</title><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><script src="https://cdn.jsdelivr.net/npm/@hyperframes/core/dist/hyperframe.runtime.iife.js"></script><style>'+css+'</style></head><body><div id="stage" data-composition-id="hyeonu-taemong" data-start="0" data-width="1080" data-height="1920" data-duration="'+totalDuration.toFixed(3)+'" data-fps="30">'+scenesHtml+'<div id="cover-title"><span id="cover-kicker">A DREAM BEFORE WE MET</span>'+html(story.title)+'</div>'+captionsHtml+'<div id="moon-bloom"></div><div id="dream-glow"></div><div id="impact-flash"></div><div id="white-flash"></div><div id="warm-dissolve"></div><audio id="narration" data-start="'+intro.toFixed(3)+'" data-duration="'+narrationDuration.toFixed(3)+'" data-track-index="8" data-volume="1" src="./audio/narration.wav"></audio></div><script>const tl=gsap.timeline({paused:true});tl.fromTo("#cover-title",{opacity:0,y:22},{opacity:1,y:0,duration:.9,ease:"power2.out"},.25);tl.to("#cover-title",{opacity:0,y:-10,duration:.75,ease:"power2.in"},'+Math.max(.5,intro-.65).toFixed(3)+');tl.fromTo("#moon-bloom",{opacity:.08},{opacity:.34,duration:1.6,yoyo:true,repeat:1,ease:"sine.inOut"},.2);'+motion.join("")+'window.__timelines=window.__timelines||{};window.__timelines["hyeonu-taemong"]=tl;</script></body></html>';
fs.writeFileSync("index.html", doc);
fs.writeFileSync("timeline.json", JSON.stringify({ totalDuration, narrationDuration, timings, captions }, null, 2));
console.log("Built HyperFrames composition: " + totalDuration.toFixed(2) + "s, captions=" + captions.length);
