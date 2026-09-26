import fs from "node:fs";

const GROUP_ID="perf-realistic-5y";
const SECONDARY_GROUPS=[
  {id:"perf-realistic-club",name:"Performance Club",sessionCount:78,playerIndexes:[0,1,2]},
  {id:"perf-realistic-friends",name:"Performance Friends",sessionCount:12,playerIndexes:[0,2,3]},
];
const PLAYERS=[
  ["perf-realistic-p1","性能 山田"],
  ["perf-realistic-p2","性能 鈴木"],
  ["perf-realistic-p3","性能 佐藤"],
  ["perf-realistic-p4","性能 高橋"],
];
const SESSION_COUNT=260;
const TARGET_GAMES=3120;
const END_DATE="2026-09-20";
const SEED=1372026;

let state=SEED>>>0;
const rnd=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const rows=(table,columns,items,chunk=100)=>{
  const out=[];
  for(let i=0;i<items.length;i+=chunk){
    const part=items.slice(i,i+chunk);
    out.push(`INSERT INTO ${table}(${columns.join(",")}) VALUES\n${part.map(r=>"("+r.map(v=>typeof v==="number"?String(v):v===null?"NULL":q(v)).join(",")+")").join(",\n")};`);
  }
  return out;
};
const addDays=(iso,days)=>{const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const startDate=addDays(END_DATE,-7*(SESSION_COUNT-1));
const createdAt=startDate+"T09:00:00Z";
const sql=[];
sql.push(...rows("groups",["id","name","created_at","updated_at"],[[GROUP_ID,"Performance 5y realistic",createdAt,createdAt]]));
sql.push(...rows("players",["id","display_name","created_at","updated_at"],PLAYERS.map(([id,name])=>[id,name,createdAt,createdAt])));
sql.push(...rows("group_players",["group_id","player_id","active"],PLAYERS.map(([id])=>[GROUP_ID,id,1])));
for(const secondary of SECONDARY_GROUPS){
  sql.push(...rows("groups",["id","name","created_at","updated_at"],[[secondary.id,secondary.name,createdAt,createdAt]]));
  sql.push(...rows("group_players",["group_id","player_id","active"],secondary.playerIndexes.map(i=>[secondary.id,PLAYERS[i][0],1])));
}

const sessions=[],segments=[],segmentPlayers=[],games=[],results=[],chips=[],notes=[];
const gameCounts=Array(SESSION_COUNT).fill(12);
// Keep the same 3,120-game total while introducing realistic short/long sessions.
for(let i=0;i<20;i++){gameCounts[i]-=6;gameCounts[20+i]+=6;}
for(let i=0;i<10;i++){gameCounts[40+i]-=3;gameCounts[50+i]+=3;}
for(let i=0;i<10;i++){gameCounts[60+i]-=2;gameCounts[70+i]+=2;}
for(let i=0;i<10;i++){gameCounts[80+i]-=1;gameCounts[90+i]+=1;}
if(gameCounts.reduce((a,b)=>a+b,0)!==TARGET_GAMES)throw new Error("game count invariant failed");

let minScore=Infinity,maxScore=-Infinity,zeroChipSessions=0,noteSessions=0;
const participation=new Map(PLAYERS.map(([id])=>[id,0]));
for(let s=0;s<SESSION_COUNT;s++){
  const date=addDays(startDate,s*7);
  const sid=`${GROUP_ID}-s${String(s+1).padStart(4,"0")}`;
  const seg=`${sid}-seg1`;
  const started=`${date}T09:00:00Z`,ended=`${date}T15:00:00Z`;
  const absent=s%4;
  const participants=PLAYERS.filter((_,i)=>i!==absent);
  participants.forEach(([id])=>participation.set(id,participation.get(id)+1));
  let note=null;
  if(s%17===0){note=`性能試験用メモ: 第${s+1}回。表示折り返しと履歴一覧を確認するための再現可能なテストデータです。`;noteSessions++;}
  sessions.push([sid,GROUP_ID,date,started,ended,"finalized",note,1,started,ended]);
  segments.push([seg,sid,1]);
  participants.forEach(([id],seat)=>segmentPlayers.push([seg,id,seat]));

  let c1=Math.floor(rnd()*9)-4,c2=Math.floor(rnd()*9)-4;
  if(s%13===0){c1=0;c2=0;zeroChipSessions++;}
  const chipValues=[c1,c2,-c1-c2];
  participants.forEach(([id],i)=>chips.push([sid,id,chipValues[i]]));

  for(let g=0;g<gameCounts[s];g++){
    const gid=`${sid}-g${String(g+1).padStart(2,"0")}`;
    const mins=g*20,hour=9+Math.floor(mins/60),minute=mins%60;
    games.push([gid,sid,seg,g+1,`${date}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00Z`,1]);
    // Deterministic, asymmetric scores; player rotation prevents identical long-term graphs.
    let a=Math.round((rnd()-.5)*100),b=Math.round((rnd()-.5)*80);
    if((s+g)%29===0)a=(s%2===0?75:-75);
    const vals=[a,b,-a-b];
    minScore=Math.min(minScore,...vals);maxScore=Math.max(maxScore,...vals);
    const ranked=participants.map(([id],i)=>({id,score:vals[i]})).sort((x,y)=>y.score-x.score||x.id.localeCompare(y.id));
    const rank=new Map(ranked.map((x,i)=>[x.id,i+1]));
    participants.forEach(([id],i)=>results.push([gid,id,rank.get(id),vals[i]]));
  }
}
sql.push(...rows("sessions",["id","group_id","session_date","started_at","ended_at","status","note","version","created_at","updated_at"],sessions));
sql.push(...rows("participant_segments",["id","session_id","sequence"],segments));
sql.push(...rows("segment_players",["segment_id","player_id","seat_order"],segmentPlayers));
sql.push(...rows("games",["id","session_id","segment_id","sequence","played_at","version"],games));
sql.push(...rows("game_results",["game_id","player_id","rank","score_point"],results));
sql.push(...rows("chip_results",["session_id","player_id","chip_count"],chips));

// Add smaller secondary Groups so local validation covers realistic multi-group isolation.
for(const secondary of SECONDARY_GROUPS){
  for(let s=0;s<secondary.sessionCount;s++){
    const date=addDays(startDate,s*14);
    const sid=`${secondary.id}-s${String(s+1).padStart(4,"0")}`;
    const seg=`${sid}-seg1`;
    const started=`${date}T10:00:00Z`,ended=`${date}T14:00:00Z`;
    const participantIds=secondary.playerIndexes.map(i=>PLAYERS[i][0]);
    sessions.push([sid,secondary.id,date,started,ended,"finalized",s%11===0?`${secondary.name} fixture ${s+1}`:null,1,started,ended]);
    segments.push([seg,sid,1]);
    participantIds.forEach((id,seat)=>segmentPlayers.push([seg,id,seat]));
    const cv=[s%5-2,(s+2)%5-2,0];cv[2]=-(cv[0]+cv[1]);
    participantIds.forEach((id,i)=>chips.push([sid,id,cv[i]]));
    for(let g=0;g<8;g++){
      const gid=`${sid}-g${String(g+1).padStart(2,"0")}`;
      games.push([gid,sid,seg,g+1,`${date}T${String(10+Math.floor(g/3)).padStart(2,"0")}:${String((g%3)*20).padStart(2,"0")}:00Z`,1]);
      const a=((s+g)%41)-20,b=((s*2+g)%31)-15,vals=[a,b,-a-b];
      const ranked=participantIds.map((id,i)=>({id,score:vals[i]})).sort((x,y)=>y.score-x.score||x.id.localeCompare(y.id));
      const rank=new Map(ranked.map((x,i)=>[x.id,i+1]));
      participantIds.forEach((id,i)=>results.push([gid,id,rank.get(id),vals[i]]));
    }
  }
}

const meta={
  seed:SEED,groupId:GROUP_ID,startDate,endDate:END_DATE,secondaryGroups:SECONDARY_GROUPS.map(g=>({id:g.id,name:g.name,sessions:g.sessionCount,players:g.playerIndexes.map(i=>PLAYERS[i][0])})),
  sessions:sessions.length,games:games.length,gameResults:results.length,
  players:PLAYERS.map(([id,name])=>({id,name,sessions:participation.get(id)})),
  gameCountRange:[Math.min(...gameCounts),Math.max(...gameCounts)],
  scoreRange:[minScore,maxScore],zeroChipSessions,noteSessions,
  invariants:{
    targetGames:games.length===TARGET_GAMES,
    everyGameHasThreeResults:results.length===games.length*3,
    fourPlayersRotate:true,
    baseFixtureFinalizedOnly:true,
    crudDataIncluded:false
  }
};
fs.mkdirSync("performance-output",{recursive:true});
fs.writeFileSync("performance-output/performance-5y-realistic.sql",sql.join("\n"));
fs.writeFileSync("performance-output/performance-5y-realistic-meta.json",JSON.stringify(meta,null,2));
console.log(JSON.stringify(meta,null,2));
