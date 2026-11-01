/** Pure UAT artifact policy: no Cloudflare API calls or deployments. */
export const UAT_NAME="mahjong-score-android-uat";
export const PROVISIONAL_D1_ID="00000000-0000-4000-8000-000000000000";
export const validateUatArtifact=({source,generated,production,performance,mode="deploy"})=>{
  const fail=(message)=>{throw new Error("Android UAT safety gate: "+message);};
  if(!["ci","deploy"].includes(mode))fail("invalid mode");
  if(source?.name!==UAT_NAME||generated?.name!==UAT_NAME)fail("Worker name mismatch");
  if(source?.vars?.PASSKEY_ENV!=="android-uat"||
     generated?.vars?.PASSKEY_ENV!=="android-uat")fail("server RP selector mismatch");
  if(Object.keys(source.vars).sort().join(",")!=="PASSKEY_ENV"||
     Object.keys(generated.vars).sort().join(",")!=="PASSKEY_ENV")
    fail("unexpected Worker vars (including LINE production configuration)");
  const routes=[source.route,source.routes,generated.route,generated.routes,
    source.triggers?.crons,generated.triggers?.crons];
  if(routes.some(v=>v!==undefined&&v!==null&&(!Array.isArray(v)||v.length>0)))
    fail("UAT cannot define production routes, custom routes or cron triggers");
  if(source?.workers_dev!==true||source?.preview_urls!==false)
    fail("UAT source must use a dedicated workers.dev hostname without preview URLs");
  if(generated?.workers_dev===false||generated?.preview_urls===true)
    fail("unexpected generated host mode");
  const s=source.d1_databases,g=generated.d1_databases;
  if(!Array.isArray(s)||s.length!==1||!Array.isArray(g)||g.length!==1)
    fail("UAT must bind exactly one D1 database");
  if(s[0].binding!=="DB"||g[0].binding!=="DB"||
     s[0].database_name!==UAT_NAME||g[0].database_name!==UAT_NAME)
    fail("UAT D1 name/binding mismatch");
  const id=s[0].database_id;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id??""))
    fail("invalid dedicated D1 UUID");
  if(g[0].database_id!==id)fail("generated D1 UUID differs from UAT source");
  if(s[0].preview_database_id||g[0].preview_database_id||
     (source.previews?.d1_databases?.length??0)>0||
     (generated.previews?.d1_databases?.length??0)>0)
    fail("UAT must not bind a preview D1");
  const protectedIds=[
    production.d1_databases?.[0]?.database_id,
    production.d1_databases?.[0]?.preview_database_id,
    production.previews?.d1_databases?.[0]?.database_id,
    performance.d1_databases?.[0]?.database_id,
  ];
  if(protectedIds.some(x=>!x)||new Set(protectedIds).size<3)fail("protected D1 IDs missing");
  if(protectedIds.includes(id))fail("UAT D1 matches a protected production/preview/performance DB");
  for(const protectedId of new Set(protectedIds)){
    if(JSON.stringify(generated).includes(protectedId))fail("generated artifact references protected D1");
  }
  if(mode==="deploy"&&id===PROVISIONAL_D1_ID)
    fail("placeholder D1 is not provisioned; deploy gate stays closed");
  return {workerName:UAT_NAME,d1Id:id,provisional:id===PROVISIONAL_D1_ID};
};
