import fs from "node:fs";

const profiles=[
  {key:"5y",groupId:"perf-5y",sessions:260,start:"2021-01-03"},
  {key:"10y",groupId:"perf-10y",sessions:520,start:"2016-01-03"},
];
const q=(v)=>"'"+String(v).replaceAll("'","''")+"'";
const rows=(table,columns,items,chunk=100)=>{
  const out=[];
  for(let i=0;i<items.length;i+=chunk){
    const part=items.slice(i,i+chunk);
    out.push(`INSERT INTO ${table}(${columns.join(",")}) VALUES\n${part.map(r=>"("+r.map(v=>typeof v==="number"?String(v):v===null?"NULL":q(v)).join(",")+")").join(",\n")};`);
  }
  return out;
};
const addDays=(iso,days)=>{const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const sql=[];
const meta={generatedAt:new Date().toISOString(),profiles:[]};
for(const p of profiles){
  const createdAt=p.start+"T09:00:00Z";
  sql.push(...rows("groups",["id","name","created_at","updated_at"],[[p.groupId,`Performance ${p.key}`,createdAt,createdAt]]));
  const players=[1,2,3].map(n=>[`${p.groupId}-p${n}`,`Perf P${n}`,createdAt,createdAt]);
  sql.push(...rows("players",["id","display_name","created_at","updated_at"],players));
  sql.push(...rows("group_players",["group_id","player_id","active"],players.map(r=>[p.groupId,r[0],1])));
  const sessionRows=[],segmentRows=[],segmentPlayerRows=[],gameRows=[],resultRows=[],chipRows=[],noteRows=[];
  let latestDate=p.start;
  for(let s=1;s<=p.sessions;s++){
    const date=addDays(p.start,(s-1)*7);latestDate=date;
    const sid=`${p.groupId}-s${String(s).padStart(4,"0")}`;
    const seg=`${sid}-seg1`;
    const started=`${date}T09:00:00Z`,ended=`${date}T15:00:00Z`;
    sessionRows.push([sid,p.groupId,date,started,ended,"finalized",`performance fixture ${p.key}`,1,started,ended]);
    segmentRows.push([seg,sid,1]);
    for(let seat=1;seat<=3;seat++)segmentPlayerRows.push([seg,`${p.groupId}-p${seat}`,seat-1]);
    const chips=[(s%5)-2,((s+1)%5)-2,0];
    chips[2]=-(chips[0]+chips[1]);
    for(let n=1;n<=3;n++)chipRows.push([sid,`${p.groupId}-p${n}`,chips[n-1]]);
    noteRows.push([sid,`${p.groupId}-p1`,`fixture note ${s}`]);
    for(let g=1;g<=12;g++){
      const gid=`${sid}-g${String(g).padStart(2,"0")}`;
      const minute=String((g-1)*20%60).padStart(2,"0");
      const hour=String(9+Math.floor((g-1)*20/60)).padStart(2,"0");
      gameRows.push([gid,sid,seg,g,`${date}T${hour}:${minute}:00Z`,1]);
      const a=((s+g)%31)-15,b=((s*2+g)%21)-10,c=-(a+b);
      resultRows.push([gid,`${p.groupId}-p1`,1,a],[gid,`${p.groupId}-p2`,2,b],[gid,`${p.groupId}-p3`,3,c]);
    }
  }
  sql.push(...rows("sessions",["id","group_id","session_date","started_at","ended_at","status","note","version","created_at","updated_at"],sessionRows));
  sql.push(...rows("participant_segments",["id","session_id","sequence"],segmentRows));
  sql.push(...rows("segment_players",["segment_id","player_id","seat_order"],segmentPlayerRows));
  sql.push(...rows("games",["id","session_id","segment_id","sequence","played_at","version"],gameRows));
  sql.push(...rows("game_results",["game_id","player_id","rank","score_point"],resultRows));
  sql.push(...rows("chip_results",["session_id","player_id","chip_count"],chipRows));
  sql.push(...rows("session_participant_notes",["session_id","player_id","note"],noteRows));
  meta.profiles.push({
    key:p.key,groupId:p.groupId,sessions:p.sessions,games:p.sessions*12,gameResults:p.sessions*36,
    latestDate,latestYear:Number(latestDate.slice(0,4)),latestMonth:Number(latestDate.slice(5,7)),
    sampleSessionId:`${p.groupId}-s${String(p.sessions).padStart(4,"0")}`
  });
}
fs.mkdirSync("performance-output",{recursive:true});
fs.writeFileSync("performance-output/long-term-fixture.sql",sql.join("\n"));
fs.writeFileSync("performance-output/fixture-meta.json",JSON.stringify(meta,null,2));
console.log(JSON.stringify(meta,null,2));
