/** Read-only build artifact check; deploy mode (default) rejects placeholder IDs. */
import fs from "node:fs";
import path from "node:path";
import {validateUatArtifact} from "./uat-artifact-policy.mjs";
const root=process.cwd();
const load=(file)=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const mode=process.argv[2]??"deploy";
const findGeneratedConfigs=(dir)=>{
  if(!fs.existsSync(dir))throw new Error("dist missing: run Android UAT build");
  const visit=(location)=>{
    const found=[];
    for(const entry of fs.readdirSync(location,{withFileTypes:true})){
      const target=path.join(location,entry.name);
      if(entry.isDirectory())found.push(...visit(target));
      if(entry.isFile()&&entry.name==="wrangler.json")found.push(target);
    }
    return found;
  };
  return visit(dir);
};
try{
  const configs=findGeneratedConfigs(path.join(root,"dist"));
  if(configs.length!==1)throw new Error("exactly one generated wrangler.json required; found "+configs.length);
  const generated=JSON.parse(fs.readFileSync(configs[0],"utf8"));
  const result=validateUatArtifact({
    source:load("wrangler.android-uat.jsonc"),generated,
    production:load("wrangler.jsonc"),performance:load("wrangler.performance.jsonc"),mode,
  });
  console.log("Android UAT "+mode+" artifact check PASS: "+result.workerName+
    ", dedicated D1 config, provisional="+result.provisional);
  if(mode==="ci")console.log("CI validates artifacts only; this is NOT deploy approval.");
}catch(error){
  console.error(String(error));
  process.exitCode=1;
}
