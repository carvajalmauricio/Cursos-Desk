import React,{useState,useEffect,useRef} from 'react';
import {Play,Pause,RotateCcw,RotateCw,Volume2,VolumeX,Volume1,Maximize,Minimize,PictureInPicture2,Subtitles,SkipBack,SkipForward,RectangleHorizontal,Keyboard,X,LoaderCircle} from 'lucide-react';

const time=n=>{n=Math.floor(Number.isFinite(n)?n:0);const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=String(n%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${s}`:`${m}:${s}`;};
export default function VideoPlayer({videoRef,containerRef,settings,onSettings,title,section,number,total,onPrevious,onNext,hasPrevious,hasNext,cinema,onCinema,hasSubtitles,...events}){
 const [media,setMedia]=useState({playing:false,time:0,duration:0,volume:settings.volume,muted:false,buffer:0,waiting:false}),[visible,setVisible]=useState(true),[fullscreen,setFullscreen]=useState(()=>!!document.fullscreenElement),[pip,setPip]=useState(false),[captions,setCaptions]=useState(false),[help,setHelp]=useState(false),[notice,setNotice]=useState(null),[hover,setHover]=useState(null),[scrub,setScrub]=useState(null);
 const hideTimer=useRef(),noticeTimer=useRef(),seekBar=useRef(),playing=useRef(false),resume=useRef(false),lastVolume=useRef(settings.volume||.8),scrubbing=useRef(false);
 const v=()=>videoRef.current;
 const feedback=message=>{clearTimeout(noticeTimer.current);setNotice(message);noticeTimer.current=setTimeout(()=>setNotice(null),1000);};
 const reveal=()=>{setVisible(true);clearTimeout(hideTimer.current);if(playing.current&&!help&&!scrubbing.current)hideTimer.current=setTimeout(()=>{if(!containerRef.current?.contains(document.activeElement)||document.activeElement===document.body)setVisible(false);},2500);};
 const toggle=()=>{if(!v())return;if(v().paused){v().play().catch(()=>feedback('No se pudo iniciar la reproducción'));}else v().pause();reveal();};
 const seek=delta=>{if(!v()||!Number.isFinite(v().duration))return;v().currentTime=Math.max(0,Math.min(v().duration,v().currentTime+delta));feedback(`${delta>0?'+':''}${delta} s`);reveal();};
 const mute=()=>{if(!v())return;if(v().volume===0){v().volume=lastVolume.current||.8;v().muted=false;}else v().muted=!v().muted;reveal();};
 const volume=value=>{if(!v())return;v().volume=value;v().muted=value===0;if(value>0)lastVolume.current=value;reveal();};
 const full=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await containerRef.current.requestFullscreen();}catch{feedback('Pantalla completa no disponible');}};
 const picture=async()=>{try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else await v().requestPictureInPicture();}catch{feedback('Imagen en imagen no disponible para este video');}};
 const subtitles=()=>{const enabled=!captions;setCaptions(enabled);if(v())for(const track of v().textTracks)track.mode=enabled?'showing':'hidden';feedback(enabled?'Subtítulos activados':'Subtítulos desactivados');reveal();};
 const speed=n=>{onSettings({speed:n});feedback(`${n}×`);reveal();};
 const update=()=>{const video=v();if(!video)return;let buffer=0;for(let i=0;i<video.buffered.length;i++)if(video.buffered.start(i)<=video.currentTime+.5)buffer=Math.max(buffer,video.buffered.end(i));setMedia(m=>({...m,time:video.currentTime,duration:Number.isFinite(video.duration)?video.duration:0,buffer,volume:video.volume,muted:video.muted}));};
 useEffect(()=>{const change=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',change);return()=>{document.removeEventListener('fullscreenchange',change);clearTimeout(hideTimer.current);clearTimeout(noticeTimer.current);};},[]);
 useEffect(()=>{if(!hasSubtitles||!v())return;const tracks=v().textTracks;const sync=()=>{for(const t of tracks)t.mode=captions?'showing':'hidden';};tracks.addEventListener('addtrack',sync);return()=>tracks.removeEventListener('addtrack',sync);},[hasSubtitles,captions]);
 useEffect(()=>{
  const handle=e=>{
   if(help&&e.key==='Escape'){e.preventDefault();setHelp(false);return;}
   if(e.altKey||e.ctrlKey||e.metaKey||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable||help)return;
   if(e.target.tagName==='BUTTON'&&(e.code==='Space'||e.code==='Enter'))return;
   const key=e.key.toLowerCase(),rates=[.5,.75,1,1.25,1.5,1.75,2,2.5,3];
   if([' ','k','arrowleft','arrowright','arrowup','arrowdown','j','l','m','f','t','c','i','?','<','>'].includes(key)||/^[0-9]$/.test(key))e.preventDefault();else return;
   if(key===' '||key==='k')toggle();if(key==='arrowleft'||key==='j')seek(-10);if(key==='arrowright'||key==='l')seek(10);
   if(key==='arrowup')volume(Math.min(1,v().volume+.05));if(key==='arrowdown')volume(Math.max(0,v().volume-.05));if(key==='m')mute();if(key==='f')full();if(key==='t')onCinema(!cinema);if(key==='i')picture();if(key==='c'&&hasSubtitles)subtitles();if(key==='?'){setHelp(true);setVisible(true);}
   if(key==='>'||key==='<'){const idx=rates.indexOf(settings.speed);speed(rates[Math.max(0,Math.min(rates.length-1,idx+(key==='>'?1:-1)))]);}if(/^[0-9]$/.test(key)&&media.duration)v().currentTime=media.duration*Number(key)/10;
  };window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);
 },[help,cinema,captions,settings.speed,media.duration,hasSubtitles]);
 const coordinate=e=>{const rect=seekBar.current.getBoundingClientRect();return Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*media.duration;};
 const startSeek=e=>{if(e.button!==0||!media.duration)return;e.preventDefault();scrubbing.current=true;resume.current=!v().paused;v().pause();setScrub(coordinate(e));seekBar.current.setPointerCapture(e.pointerId);setVisible(true);};
 const moveSeek=e=>{const value=coordinate(e);setHover({value,left:media.duration?value/media.duration*100:0});if(scrubbing.current)setScrub(value);};
 const endSeek=e=>{if(!scrubbing.current)return;const value=coordinate(e);v().currentTime=value;scrubbing.current=false;setScrub(null);if(resume.current)v().play().catch(()=>{});reveal();};
 const percent=(scrub??media.time)/(media.duration||1)*100;
 const btn=(label,action,icon,extra={})=><button type="button" className="player-btn" aria-label={label} title={label} onClick={action} {...extra}>{icon}</button>;
 return <div className={`advanced-player ${visible||!media.playing||help||scrub!==null?'controls-visible':'controls-hidden'}`} onMouseMove={reveal} onMouseLeave={()=>{if(media.playing&&!help&&!scrubbing.current)setVisible(false);}} onFocus={reveal}>
  <video {...events} ref={videoRef} controls={false} onClick={toggle} onDoubleClick={full}
   onLoadedMetadata={e=>{events.onLoadedMetadata?.(e);update();}}
   onTimeUpdate={e=>{update();events.onTimeUpdate?.(e);}}
   onProgress={update} onSeeked={e=>{update();events.onSeeked?.(e);}}
   onVolumeChange={e=>{update();events.onVolumeChange?.(e);}}
   onPlay={e=>{playing.current=true;setMedia(m=>({...m,playing:true}));reveal();events.onPlay?.(e);}}
   onPlaying={e=>{setMedia(m=>({...m,waiting:false}));events.onPlaying?.(e);}}
   onWaiting={e=>{setMedia(m=>({...m,waiting:true}));events.onWaiting?.(e);}}
   onPause={e=>{playing.current=false;setMedia(m=>({...m,playing:false,waiting:false}));setVisible(true);events.onPause?.(e);}}
   onEnded={e=>{playing.current=false;setMedia(m=>({...m,playing:false,waiting:false}));events.onEnded?.(e);}}
   onEnterPictureInPicture={()=>setPip(true)} onLeavePictureInPicture={()=>setPip(false)}
  />
  <div className="player-top"><span className="player-lesson-number">{String(number).padStart(2,'0')} / {String(total).padStart(2,'0')}</span><div><small>{section}</small><strong>{title}</strong></div><span className="player-header-nav">{btn('Clase anterior',onPrevious,<SkipBack size={15}/>,{disabled:!hasPrevious})}{btn('Clase siguiente',onNext,<SkipForward size={15}/>,{disabled:!hasNext})}</span></div>
  {!media.playing&&!media.waiting&&<button className="player-center-play" aria-label={media.time?'Reanudar video':'Reproducir video'} onClick={toggle}><Play size={30} fill="currentColor"/></button>}
  {media.waiting&&media.playing&&<div className="player-buffering" role="status"><LoaderCircle size={30}/><span>Cargando video…</span></div>}
  {notice&&<div className="player-feedback" role="status">{notice}</div>}
  {pip&&<div className="pip-message"><PictureInPicture2 size={28}/><span>Reproduciendo en ventana flotante</span></div>}
  <div className="player-bottom">
   <div className="seek-row" ref={seekBar} onPointerDown={startSeek} onPointerMove={moveSeek} onPointerUp={endSeek} onPointerCancel={()=>{scrubbing.current=false;setScrub(null);if(resume.current)v().play().catch(()=>{});}} onPointerLeave={()=>{if(!scrubbing.current)setHover(null);}}>
    <div className="player-seek-track"><span className="player-buffered" style={{width:media.buffer/(media.duration||1)*100+'%'}}/><span className="player-played" style={{width:percent+'%'}}/><span className="player-seek-thumb" style={{left:percent+'%'}}/></div>
    <input aria-label="Posición del video" type="range" min="0" max={media.duration||1} step="0.1" value={scrub??media.time} onChange={e=>{if(!scrubbing.current&&v())v().currentTime=Number(e.target.value);}} onPointerDown={e=>e.preventDefault()}/>
    {hover&&<span className="seek-tooltip" style={{left:`clamp(28px, ${hover.left}%, calc(100% - 28px))`}}>{time(hover.value)}</span>}
   </div>
   <div className="player-controls">
    {btn(media.playing?'Pausar':'Reproducir',toggle,media.playing?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>)}
    {btn('Retroceder 10 segundos',()=>seek(-10),<span className="jump-icon"><RotateCcw size={21}/><small>10</small></span>)}
    {btn('Avanzar 10 segundos',()=>seek(10),<span className="jump-icon"><RotateCw size={21}/><small>10</small></span>)}
    <span className="player-time"><b>{time(scrub??media.time)}</b><span>/</span>{time(media.duration)}</span>
    <div className="player-volume">{btn(media.muted||media.volume===0?'Activar sonido':'Silenciar',mute,media.muted||media.volume===0?<VolumeX size={20}/>:media.volume<.5?<Volume1 size={20}/>:<Volume2 size={20}/>)}<input aria-label="Volumen" type="range" min="0" max="1" step="0.01" value={media.muted?0:media.volume} onChange={e=>volume(Number(e.target.value))}/></div>
    <div className="player-controls-right"><label className="player-speed" title="Velocidad de reproducción"><select aria-label="Velocidad" value={settings.speed} onChange={e=>speed(Number(e.target.value))}>{[.5,.75,1,1.25,1.5,1.75,2,2.5,3].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>
    {btn(captions?'Desactivar subtítulos':'Activar subtítulos',subtitles,<Subtitles size={20}/>,{disabled:!hasSubtitles,'aria-pressed':captions})}
    {btn('Atajos del reproductor',()=>{setHelp(true);setVisible(true);},<Keyboard size={20}/>)}
    {document.pictureInPictureEnabled&&btn(pip?'Salir de imagen en imagen':'Imagen en imagen',picture,<PictureInPicture2 size={20}/>)}
    {btn(cinema?'Salir del modo cine':'Modo cine',()=>onCinema(!cinema),<RectangleHorizontal size={21}/>,{'aria-pressed':cinema})}
    {btn(fullscreen?'Salir de pantalla completa':'Pantalla completa',full,fullscreen?<Minimize size={20}/>:<Maximize size={20}/>)}
    </div>
   </div>
  </div>
  {help&&<div className="player-shortcuts" role="dialog" aria-label="Atajos del reproductor" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setHelp(false);}}}><div><strong>Todo al alcance del teclado</strong>{btn('Cerrar atajos',()=>setHelp(false),<X size={18}/>)}<dl>{[['Espacio / K','Reproducir o pausar'],['← / J · → / L','Retroceder / avanzar 10 s'],['↑ / ↓','Subir / bajar volumen'],['M','Silenciar'],['F','Pantalla completa'],['T','Modo cine'],['I','Imagen en imagen'],['C','Subtítulos'],['< / >','Cambiar velocidad'],['0–9','Ir al 0–90 % del video']].map(([key,label])=><React.Fragment key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></React.Fragment>)}</dl></div></div>}
 </div>;
}
