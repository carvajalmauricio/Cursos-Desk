const { contextBridge,ipcRenderer }=require('electron');
contextBridge.exposeInMainWorld('courses',{
  library:()=>ipcRenderer.invoke('library'),
  activate:(id,enabled)=>ipcRenderer.invoke('activate',id,enabled),
  detail:id=>ipcRenderer.invoke('detail',id),
  save:(course,id,data)=>ipcRenderer.invoke('save',course,id,data),
  resource:(course,relative)=>ipcRenderer.invoke('resource',course,relative),
  open:(course,relative,choose=false)=>ipcRenderer.invoke('open',course,relative,choose),
  settings:patch=>ipcRenderer.invoke('settings',patch),
  rescan:()=>ipcRenderer.invoke('rescan'),
  setRoot:folder=>ipcRenderer.invoke('set-root',folder),
  onChanged:callback=>{const fn=()=>callback();ipcRenderer.on('changed',fn);return ()=>ipcRenderer.removeListener('changed',fn);},
  onClosing:callback=>{const fn=async()=>{try{await callback();}finally{ipcRenderer.send('ready-close');}};ipcRenderer.on('closing',fn);return ()=>ipcRenderer.removeListener('closing',fn);}
});
