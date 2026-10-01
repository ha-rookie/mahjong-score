import { useEffect, useState } from "react";

export function InitialBootOverlay() {
  const [visible,setVisible]=useState(true);

  useEffect(()=>{
    const root=document.getElementById("root");
    if(!root)return;

    let observer:MutationObserver|null=null;
    let frame=0;

    const stop=()=>{
      if(observer){observer.disconnect();observer=null;}
      if(frame)cancelAnimationFrame(frame);
    };

    const appIsReady=()=>{
      const page=root.querySelector("main.page");
      if(!page)return false;
      const first=page.firstElementChild;
      return Boolean(first&&!first.classList.contains("loading"));
    };

    const waitForReady=()=>{
      stop();
      const check=()=>{
        if(appIsReady()){
          stop();
          frame=requestAnimationFrame(()=>setVisible(false));
        }
      };
      observer=new MutationObserver(check);
      observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
      check();
    };

    const onAuthState=()=>waitForReady();
    window.addEventListener("mahjong:auth-state",onAuthState);

    return()=>{
      window.removeEventListener("mahjong:auth-state",onAuthState);
      stop();
    };
  },[]);

  if(!visible)return null;

  return <div aria-label="三麻スコアを起動中" role="status" style={{position:"fixed",inset:0,zIndex:10000,display:"grid",placeItems:"center",background:"var(--color-bg, #f6f7f8)"}}>
    <div style={{display:"grid",justifyItems:"center",gap:"12px"}}>
      <img src="/mahjong-score-icon.png" alt="" aria-hidden="true" style={{width:"64px",height:"64px",borderRadius:"16px"}} />
      <strong style={{fontSize:"20px",letterSpacing:"0.04em"}}>三麻スコア</strong>
    </div>
  </div>;
}
