import { requestCorrelationId, writeAuditLog } from "../audit";
interface AuthEnv { DB: D1Database; LINE_CHANNEL_ID?: string; LINE_CHANNEL_SECRET?: string; AUTH_SESSION_SECRET?: string; }
type LineToken={id_token?:string};
type LineIdentity={sub?:string;name?:string};
type LineError={error?:string;error_description?:string};
type InviteRow={id:string;groupId:string;playerId:string;expiresAt:string};
type LoginStateRow={nonce:string;invitationId:string|null};
const enc=new TextEncoder();
const auditAuth=(request:Request,event:string,outcome:"success"|"failure",fields:{userId?:string|null;resourceType?:string;resourceId?:string|null;reason?:string}={})=>writeAuditLog({event,requestId:requestCorrelationId(request),method:request.method,path:new URL(request.url).pathname,outcome,...fields});

const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const random=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
const hashToken=async(value:string)=>base64url(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value))));
const validInviteToken=(value:string|null):value is string=>Boolean(value&&/^[A-Za-z0-9_-]{43}$/.test(value));
const cookie=(request:Request,name:string)=>request.headers.get("cookie")?.match(new RegExp("(?:^|; )"+name+"=([^;]+)"))?.[1];
const sign=async(value:string,secret:string)=>{const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return base64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(value))));};
const safeEqual=(a:string,b:string)=>{if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;};
const makeSession=async(userId:string,secret:string)=>{const payload=base64url(enc.encode(JSON.stringify({userId,exp:Math.floor(Date.now()/1000)+86400})));return payload+"."+await sign(payload,secret);};
const lineFailure=async(request:Request,response:Response,stage:string)=>{let details:LineError={};try{details=await response.json() as LineError;}catch{details={};}auditAuth(request,"line_login_failure","failure",{reason:stage});return new Response(JSON.stringify({error:{code:"line_"+stage+"_failed",message:details.error_description??details.error??"LINE request failed",lineStatus:response.status}}),{status:401,headers:{"content-type":"application/json; charset=utf-8"}});};

const activeInvitation=async(env:AuthEnv,token:string)=>{
  const tokenHash=await hashToken(token);
  return env.DB.prepare("SELECT id,group_id AS groupId,player_id AS playerId,expires_at AS expiresAt FROM invitations WHERE token_hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?").bind(tokenHash,new Date().toISOString()).first<InviteRow>();
};

const redeemInvitationById=async(env:AuthEnv,invitationId:string,userId:string):Promise<"accepted"|"invalid"|"conflict">=>{
  const invite=await env.DB.prepare("SELECT id,group_id AS groupId,player_id AS playerId,expires_at AS expiresAt FROM invitations WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?").bind(invitationId,new Date().toISOString()).first<InviteRow>();
  if(!invite)return "invalid";
  const existingLink=await env.DB.prepare("SELECT player_id AS playerId FROM group_players WHERE group_id=? AND user_id=?").bind(invite.groupId,userId).first<{playerId:string}>();
  if(existingLink&&existingLink.playerId!==invite.playerId)return "conflict";
  const target=await env.DB.prepare("SELECT active,user_id AS userId FROM group_players WHERE group_id=? AND player_id=?").bind(invite.groupId,invite.playerId).first<{active:number;userId:string|null}>();
  if(!target||target.active!==1||(target.userId&&target.userId!==userId))return "conflict";
  const now=new Date().toISOString();
  try{
    const result=await env.DB.batch([
      env.DB.prepare("INSERT INTO group_memberships(group_id,user_id,role,created_at,updated_at) VALUES(?,?,'member',?,?) ON CONFLICT(group_id,user_id) DO UPDATE SET role=CASE WHEN group_memberships.role='group_admin' THEN 'group_admin' ELSE 'member' END,updated_at=excluded.updated_at").bind(invite.groupId,userId,now,now),
      env.DB.prepare("UPDATE group_players SET user_id=? WHERE group_id=? AND player_id=? AND active=1 AND (user_id IS NULL OR user_id=?)").bind(userId,invite.groupId,invite.playerId,userId),
      env.DB.prepare("UPDATE invitations SET used_at=?,used_by_user_id=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL").bind(now,userId,invite.id),
    ]);
    if(result[1]?.meta.changes!==1||result[2]?.meta.changes!==1)return "conflict";
    return "accepted";
  }catch{return "conflict";}
};

export const authenticatedUserId=async(request:Request,env:AuthEnv)=>{
  if(!env.AUTH_SESSION_SECRET)return null;
  const raw=cookie(request,"mahjong_session"),[payload,sig]=raw?.split(".")??[];
  if(!payload||!sig||!safeEqual(await sign(payload,env.AUTH_SESSION_SECRET),sig))return null;
  try{
    const padded=payload.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(payload.length/4)*4,"=");
    const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded),c=>c.charCodeAt(0)))) as {userId?:string;exp?:number};
    return data.userId&&data.exp&&data.exp>Math.floor(Date.now()/1000)?data.userId:null;
  }catch{return null;}
};

export const startLineLogin=async(request:Request,env:AuthEnv)=>{
  if(!env.LINE_CHANNEL_ID)return new Response("LINE Login is not configured",{status:503});
  const url=new URL(request.url),inviteToken=url.searchParams.get("invite");
  if(inviteToken&&!validInviteToken(inviteToken)){auditAuth(request,"line_login_failure","failure",{reason:"invalid_invitation_format"});return new Response("Invalid invitation",{status:400});}
  const invitation=inviteToken?await activeInvitation(env,inviteToken):null;
  if(inviteToken&&!invitation){auditAuth(request,"line_login_failure","failure",{reason:"invitation_invalid_or_expired"});return new Response("Invitation is invalid or expired",{status:410});}
  const state=random(),nonce=random(),now=new Date(),expires=new Date(now.getTime()+10*60*1000),stateHash=await hashToken(state);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM line_login_states WHERE expires_at<? OR used_at IS NOT NULL").bind(now.toISOString()),
    env.DB.prepare("INSERT INTO line_login_states(state_hash,nonce,invitation_id,expires_at,created_at) VALUES(?,?,?,?,?)").bind(stateHash,nonce,invitation?.id??null,expires.toISOString(),now.toISOString()),
  ]);
  const callback=new URL("/api/auth/line/callback",url.origin).toString(),to=new URL("https://access.line.me/oauth2/v2.1/authorize");
  to.search=new URLSearchParams({response_type:"code",client_id:env.LINE_CHANNEL_ID,redirect_uri:callback,state,scope:"profile openid",nonce}).toString();
  return new Response(null,{status:302,headers:{location:to.toString()}});
};

export const finishLineLogin=async(request:Request,env:AuthEnv)=>{
  if(!env.LINE_CHANNEL_ID||!env.LINE_CHANNEL_SECRET||!env.AUTH_SESSION_SECRET)return new Response("LINE Login is not configured",{status:503});
  const url=new URL(request.url);
  if(url.searchParams.get("error")){auditAuth(request,"line_login_failure","failure",{reason:"cancelled"});return new Response("LINE Login was cancelled",{status:401});}
  const code=url.searchParams.get("code"),state=url.searchParams.get("state");
  if(!code||!state){auditAuth(request,"line_login_failure","failure",{reason:"missing_code_or_state"});return new Response("Invalid LINE Login state",{status:400});}
  const stateHash=await hashToken(state),now=new Date().toISOString();
  const loginState=await env.DB.prepare("SELECT nonce,invitation_id AS invitationId FROM line_login_states WHERE state_hash=? AND used_at IS NULL AND expires_at>?").bind(stateHash,now).first<LoginStateRow>();
  if(!loginState){auditAuth(request,"line_login_failure","failure",{reason:"state_invalid_or_expired"});return new Response("Invalid LINE Login state",{status:400});}
  const consumed=await env.DB.prepare("UPDATE line_login_states SET used_at=? WHERE state_hash=? AND used_at IS NULL").bind(now,stateHash).run();
  if(consumed.meta.changes!==1){auditAuth(request,"line_login_failure","failure",{reason:"state_already_consumed"});return new Response("Invalid LINE Login state",{status:400});}

  const redirectUri=new URL("/api/auth/line/callback",url.origin).toString();
  const tokenResponse=await fetch("https://api.line.me/oauth2/v2.1/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:redirectUri,client_id:env.LINE_CHANNEL_ID,client_secret:env.LINE_CHANNEL_SECRET})});
  if(!tokenResponse.ok)return lineFailure(request,tokenResponse,"token_exchange");
  const token=await tokenResponse.json() as LineToken;
  if(!token.id_token){auditAuth(request,"line_login_failure","failure",{reason:"id_token_missing"});return new Response("LINE ID token missing",{status:401});}
  const verifyResponse=await fetch("https://api.line.me/oauth2/v2.1/verify",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({id_token:token.id_token,client_id:env.LINE_CHANNEL_ID,nonce:loginState.nonce})});
  if(!verifyResponse.ok)return lineFailure(request,verifyResponse,"id_token_verification");
  const identity=await verifyResponse.json() as LineIdentity;
  if(!identity.sub){auditAuth(request,"line_login_failure","failure",{reason:"subject_missing"});return new Response("LINE subject missing",{status:401});}

  let row=await env.DB.prepare("SELECT user_id AS userId FROM external_identities WHERE provider='line' AND provider_subject=?").bind(identity.sub).first<{userId:string}>();
  const updatedAt=new Date().toISOString();
  if(!row){
    const userId=crypto.randomUUID();
    try{
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(userId,identity.name??null,updatedAt,updatedAt),
        env.DB.prepare("INSERT INTO external_identities(provider,provider_subject,user_id,created_at) VALUES('line',?,?,?)").bind(identity.sub,userId,updatedAt),
      ]);
      row={userId};
    }catch{
      row=await env.DB.prepare("SELECT user_id AS userId FROM external_identities WHERE provider='line' AND provider_subject=?").bind(identity.sub).first<{userId:string}>();
      if(!row)return new Response("User registration failed",{status:500});
    }
  }else if(identity.name){
    await env.DB.prepare("UPDATE users SET display_name=?,updated_at=? WHERE id=?").bind(identity.name,updatedAt,row.userId).run();
  }

  const inviteResult=loginState.invitationId?await redeemInvitationById(env,loginState.invitationId,row.userId):null;
  const session=await makeSession(row.userId,env.AUTH_SESSION_SECRET);
  const destination=new URL("/",url.origin);
  destination.searchParams.set("login","success");
  if(inviteResult)destination.searchParams.set("invite",inviteResult);
  auditAuth(request,"line_login_success","success",{userId:row.userId,resourceType:"authentication",resourceId:loginState.invitationId});
  return new Response(null,{status:302,headers:{location:destination.toString(),"set-cookie":"mahjong_session="+session+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400"}});
};

export const authMe=async(request:Request,env:AuthEnv)=>{
  const userId=await authenticatedUserId(request,env);
  if(!userId)return new Response(JSON.stringify({authenticated:false}),{status:401,headers:{"content-type":"application/json; charset=utf-8"}});
  const user=await env.DB.prepare("SELECT id,display_name AS displayName,system_role AS systemRole FROM users WHERE id=?").bind(userId).first();
  const memberships=await env.DB.prepare("SELECT gm.group_id AS groupId,g.name AS groupName,gm.role,gp.player_id AS playerId,p.display_name AS playerDisplayName FROM group_memberships gm JOIN groups g ON g.id=gm.group_id LEFT JOIN group_players gp ON gp.group_id=gm.group_id AND gp.user_id=gm.user_id LEFT JOIN players p ON p.id=gp.player_id WHERE gm.user_id=? ORDER BY gm.created_at,gm.group_id").bind(userId).all();
  const anyAdmin=await env.DB.prepare("SELECT 1 AS ok FROM users WHERE system_role='admin' LIMIT 1").first();
  return new Response(JSON.stringify({authenticated:true,user,memberships:memberships.results,canBootstrapAdmin:!anyAdmin}),{headers:{"content-type":"application/json; charset=utf-8"}});
};

export const bootstrapAdmin=async(request:Request,env:AuthEnv)=>{
  const userId=await authenticatedUserId(request,env);
  if(!userId){auditAuth(request,"authentication_failure","failure",{reason:"bootstrap_admin_without_session"});return new Response(JSON.stringify({error:{code:"unauthorized",message:"Authentication required"}}),{status:401,headers:{"content-type":"application/json; charset=utf-8"}});}
  const current=await env.DB.prepare("SELECT system_role AS systemRole FROM users WHERE id=?").bind(userId).first<{systemRole:"admin"|"user"}>();
  if(current?.systemRole==="admin")return authMe(request,env);
  const existingAdmin=await env.DB.prepare("SELECT id FROM users WHERE system_role='admin' LIMIT 1").first();
  if(existingAdmin)return new Response(JSON.stringify({error:{code:"bootstrap_closed",message:"Initial system administrator has already been configured"}}),{status:409,headers:{"content-type":"application/json; charset=utf-8"}});
  await env.DB.prepare("UPDATE users SET system_role='admin',updated_at=? WHERE id=?").bind(new Date().toISOString(),userId).run();
  auditAuth(request,"system_admin_bootstrapped","success",{userId,resourceType:"user",resourceId:userId});
  return authMe(request,env);
};

export const logout=()=>new Response(null,{status:204,headers:{"set-cookie":"mahjong_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"}});
