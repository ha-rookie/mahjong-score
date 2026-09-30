export const AUTH_SESSION_EXPIRED_EVENT="mahjong:auth-expired";
export const AUTH_CHECK_INTERVAL_MS=60*60*1000;

const authControlPaths=new Set([
  "/api/auth/me",
  "/api/auth/line/start",
  "/api/auth/line/callback",
  "/api/auth/logout",
]);

export const isProtectedApiPath=(pathname:string):boolean=>
  pathname.startsWith("/api/")&&!authControlPaths.has(pathname)&&pathname!=="/api/health";

let installed=false;

export const installBrowserAuthSessionGuard=()=>{
  if(installed)return;
  installed=true;
  const nativeFetch=window.fetch.bind(window);
  let lastSuccessfulAuthCheckAt=0;
  let authCheckInFlight:Promise<"valid"|"expired"|"unknown">|null=null;
  let expiryEventSent=false;

  const notifyExpired=()=>{
    if(expiryEventSent)return;
    expiryEventSent=true;
    window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
  };

  const authCheck=async():Promise<"valid"|"expired"|"unknown">=>{
    if(Date.now()-lastSuccessfulAuthCheckAt<AUTH_CHECK_INTERVAL_MS)return "valid";
    if(authCheckInFlight)return authCheckInFlight;
    authCheckInFlight=(async()=>{
      try{
        const response=await nativeFetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"});
        if(response.ok){lastSuccessfulAuthCheckAt=Date.now();expiryEventSent=false;return "valid";}
        if(response.status===401){notifyExpired();return "expired";}
        return "unknown";
      }catch{return "unknown";}
    })();
    try{return await authCheckInFlight;}finally{authCheckInFlight=null;}
  };

  window.fetch=async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
    const rawUrl=input instanceof Request?input.url:typeof input==="string"?input:input.toString();
    const url=new URL(rawUrl,window.location.href);
    const sameOrigin=url.origin===window.location.origin;

    if(sameOrigin&&url.pathname==="/api/auth/me"){
      const response=await nativeFetch(input,init);
      if(response.ok){lastSuccessfulAuthCheckAt=Date.now();expiryEventSent=false;}
      return response;
    }

    if(sameOrigin&&isProtectedApiPath(url.pathname)){
      const state=await authCheck();
      if(state==="expired")return new Response(JSON.stringify({error:{code:"unauthorized",message:"Authentication required"}}),{status:401,statusText:"Unauthorized",headers:{"content-type":"application/json; charset=utf-8"}});
      const response=await nativeFetch(input,init);
      if(response.status===401)notifyExpired();
      return response;
    }

    return nativeFetch(input,init);
  };
};
