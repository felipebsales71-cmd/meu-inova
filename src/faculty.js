const encoder = new TextEncoder();
const decoder = new TextDecoder();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS academic_professors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  specialty TEXT,
  registration TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ac_prof_name ON academic_professors(name);
CREATE TABLE IF NOT EXISTS academic_professor_disciplines (
  professor_id INTEGER NOT NULL REFERENCES academic_professors(id) ON DELETE CASCADE,
  discipline_id INTEGER NOT NULL REFERENCES academic_disciplines(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(professor_id,discipline_id)
);
`;

let ready = null;
const nowIso = () => new Date().toISOString();
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
class FacultyError extends Error{constructor(status,message){super(message);this.status=status}}

function bytesFromB64url(value){const base=String(value).replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-(String(value).length%4))%4);const bin=atob(base);return Uint8Array.from(bin,c=>c.charCodeAt(0))}
async function adminSession(request,env){const auth=request.headers.get('authorization')||'';if(!auth.startsWith('Bearer '))throw new FacultyError(401,'Autenticação administrativa necessária.');try{const [body,sig]=auth.slice(7).split('.');if(!body||!sig||!env.SESSION_SECRET)throw 0;const key=await crypto.subtle.importKey('raw',encoder.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);const ok=await crypto.subtle.verify('HMAC',key,bytesFromB64url(sig),encoder.encode(body));if(!ok)throw 0;const p=JSON.parse(decoder.decode(bytesFromB64url(body)));if(p.role!=='admin'||!p.exp||p.exp<Math.floor(Date.now()/1000))throw 0;return p}catch{throw new FacultyError(401,'Sessão administrativa inválida ou expirada.')}}
async function ensure(env){if(!env.DB)throw new FacultyError(500,'Banco D1 não vinculado.');if(!ready)ready=(async()=>{for(const sql of SCHEMA.split(';').map(x=>x.trim()).filter(Boolean))await env.DB.prepare(sql).run();return true})().catch(e=>{ready=null;throw e});return ready}
async function body(request){try{return await request.json()}catch{throw new FacultyError(400,'Corpo JSON inválido.')}}
function view(row){return{id:Number(row.id),name:row.name,email:row.email||'',phone:row.phone||'',specialty:row.specialty||'',registration:row.registration||'',active:Boolean(row.active),disciplineCount:Number(row.discipline_count||0)}}

export async function handleFaculty(request,env){try{await ensure(env);await adminSession(request,env);const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();
  if(path==='/api/faculty/professors'&&method==='GET'){
    const r=await env.DB.prepare(`SELECT p.*,(SELECT COUNT(*) FROM academic_professor_disciplines pd WHERE pd.professor_id=p.id) discipline_count FROM academic_professors p ORDER BY p.name`).all();
    return json((r.results||[]).map(view));
  }
  if(path==='/api/faculty/professors'&&method==='POST'){
    const d=await body(request),name=String(d.name||'').trim();if(!name)throw new FacultyError(400,'Informe o nome do professor.');
    const existing=await env.DB.prepare('SELECT * FROM academic_professors WHERE lower(name)=lower(?) LIMIT 1').bind(name).first();
    if(existing)return json(view(existing));
    const ins=await env.DB.prepare('INSERT INTO academic_professors(name,email,phone,specialty,registration,active,created_at) VALUES(?,?,?,?,?,1,?)').bind(name,String(d.email||'').trim()||null,String(d.phone||'').trim()||null,String(d.specialty||'').trim()||null,String(d.registration||'').trim()||null,nowIso()).run();
    const row=await env.DB.prepare('SELECT * FROM academic_professors WHERE id=?').bind(ins.meta.last_row_id).first();return json(view(row),201);
  }
  const match=path.match(/^\/api\/faculty\/professors\/(\d+)$/);
  if(match&&method==='PATCH'){
    const id=Number(match[1]),d=await body(request),row=await env.DB.prepare('SELECT * FROM academic_professors WHERE id=?').bind(id).first();if(!row)throw new FacultyError(404,'Professor não encontrado.');
    await env.DB.prepare('UPDATE academic_professors SET name=?,email=?,phone=?,specialty=?,registration=?,active=?,updated_at=? WHERE id=?').bind(String(d.name??row.name).trim(),String(d.email??row.email??'').trim()||null,String(d.phone??row.phone??'').trim()||null,String(d.specialty??row.specialty??'').trim()||null,String(d.registration??row.registration??'').trim()||null,d.active===undefined?Number(row.active):(d.active?1:0),nowIso(),id).run();
    const updated=await env.DB.prepare(`SELECT p.*,(SELECT COUNT(*) FROM academic_professor_disciplines pd WHERE pd.professor_id=p.id) discipline_count FROM academic_professors p WHERE p.id=?`).bind(id).first();return json(view(updated));
  }
  const assign=path.match(/^\/api\/faculty\/professors\/(\d+)\/assign$/);
  if(assign&&method==='POST'){
    const id=Number(assign[1]),d=await body(request),disciplineId=Number(d.disciplineId);const professor=await env.DB.prepare('SELECT * FROM academic_professors WHERE id=?').bind(id).first();if(!professor)throw new FacultyError(404,'Professor não encontrado.');const disc=await env.DB.prepare('SELECT id FROM academic_disciplines WHERE id=?').bind(disciplineId).first();if(!disc)throw new FacultyError(404,'Disciplina não encontrada.');
    await env.DB.prepare('INSERT OR IGNORE INTO academic_professor_disciplines(professor_id,discipline_id,created_at) VALUES(?,?,?)').bind(id,disciplineId,nowIso()).run();
    await env.DB.prepare('UPDATE academic_disciplines SET professor=? WHERE id=?').bind(professor.name,disciplineId).run();
    return json({message:'Professor vinculado à disciplina.'});
  }
  const disciplines=path.match(/^\/api\/faculty\/professors\/(\d+)\/disciplines$/);
  if(disciplines&&method==='GET'){
    const id=Number(disciplines[1]);const r=await env.DB.prepare(`SELECT d.id,d.name,d.code,d.period,d.workload_hours FROM academic_professor_disciplines pd JOIN academic_disciplines d ON d.id=pd.discipline_id WHERE pd.professor_id=? ORDER BY d.name`).bind(id).all();return json((r.results||[]).map(x=>({id:x.id,name:x.name,code:x.code,period:x.period||'',workloadHours:Number(x.workload_hours||0)})));
  }
  throw new FacultyError(404,'Rota de professores não encontrada.');
}catch(e){if(e instanceof FacultyError)return json({detail:e.message},e.status);console.error('faculty-module',e);return json({detail:'Erro interno no módulo de professores.'},500)}}
