/** In-memory real P-256 WebAuthn device fixture; no fake signature bypass. */
import type {RegistrationResponseJSON,AuthenticationResponseJSON} from "@simplewebauthn/server";
import {PASSKEY_ORIGIN,PASSKEY_RP_ID} from "../../src/worker/auth/passkey-line-free";

const encoder=new TextEncoder();
const b64=(v:Uint8Array)=>Buffer.from(v).toString("base64url");
const un64=(s:string)=>new Uint8Array(Buffer.from(s,"base64url"));
const concat=(...arrays:Uint8Array[])=>{
  const b=new Uint8Array(arrays.reduce((sum,x)=>sum+x.length,0));
  let i=0;for(const x of arrays){b.set(x,i);i+=x.length;}return b;
};
const hash=async(v:Uint8Array)=>new Uint8Array(await crypto.subtle.digest("SHA-256",Uint8Array.from(v)));
const encodeCBOR=(v:unknown):Uint8Array=>{
  const head=(major:number,n:number):Uint8Array=>{
    if(n<24)return Uint8Array.of(major*32+n);
    if(n<256)return Uint8Array.of(major*32+24,n);
    if(n<65536)return Uint8Array.of(major*32+25,n>>8,n&255);
    throw new Error("CBOR test value too large");
  };
  if(typeof v==="number"&&Number.isSafeInteger(v))
    return v>=0?head(0,v):head(1,-v-1);
  if(typeof v==="string"){const bytes=encoder.encode(v);return concat(head(3,bytes.length),bytes);}
  if(v instanceof Uint8Array)return concat(head(2,v.length),v);
  if(v instanceof Map){
    const elems:Uint8Array[]=[];
    for(const [k,value] of v){elems.push(encodeCBOR(k),encodeCBOR(value));}
    return concat(head(5,v.size),...elems);
  }
  throw new Error("Unsupported test CBOR");
};
const counter=(n:number)=>Uint8Array.of(n>>>24,n>>>16&255,n>>>8&255,n&255);
const rpHash=()=>hash(encoder.encode(PASSKEY_RP_ID));
const fixedId=un64("AQIDBAUGBwgJCgsMDQ4PEA");
export const buildAuthenticator=async()=>{
  const keyPair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},
    true,["sign","verify"]);
  const publicJwk=await crypto.subtle.exportKey("jwk",keyPair.publicKey);
  const publicCose=encodeCBOR(new Map<number,unknown>([
    [1,2],[3,-7],[-1,1],[-2,un64(publicJwk.x!)],[-3,un64(publicJwk.y!)],
  ]));
  const identity=b64(fixedId);
  const authData=concat(await rpHash(),Uint8Array.of(0x45),counter(0),
    new Uint8Array(16),Uint8Array.of(0,fixedId.length),fixedId,publicCose);
  const attestObj=encodeCBOR(new Map<string,unknown>([
    ["fmt","none"],["attStmt",new Map()],["authData",authData],
  ]));
  const create=(challenge:string,origin=PASSKEY_ORIGIN):RegistrationResponseJSON=>{
    const client=encoder.encode(JSON.stringify({
      type:"webauthn.create",challenge,origin,crossOrigin:false,
    }));
    return {id:identity,rawId:identity,type:"public-key",
      response:{clientDataJSON:b64(client),attestationObject:b64(attestObj)},
      clientExtensionResults:{}} as RegistrationResponseJSON;
  };
  const authenticate=async(challenge:string):Promise<AuthenticationResponseJSON>=>{
    const auth=concat(await rpHash(),Uint8Array.of(0x05),counter(1));
    const client=encoder.encode(JSON.stringify({
      type:"webauthn.get",challenge,origin:PASSKEY_ORIGIN,crossOrigin:false,
    }));
    const raw=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},
      keyPair.privateKey,concat(auth,await hash(client))));
    const trim=(v:Uint8Array)=>{
      let i=0;while(i<v.length-1&&v[i]===0)i++;
      const part=v.slice(i);
      return part[0]&128?concat(Uint8Array.of(0),part):part;
    };
    const a=trim(raw.slice(0,raw.length/2)),b=trim(raw.slice(raw.length/2));
    const der=concat(Uint8Array.of(0x30,4+a.length+b.length,0x02,a.length),
      a,Uint8Array.of(0x02,b.length),b);
    return {id:identity,rawId:identity,type:"public-key",
      response:{clientDataJSON:b64(client),authenticatorData:b64(auth),
        signature:b64(der),userHandle:null},clientExtensionResults:{}} as unknown as AuthenticationResponseJSON;
  };
  return {create,authenticate,identity};
};
