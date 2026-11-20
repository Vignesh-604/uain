"""Bounded member-rename launch: one guardian activation, then reviewed self-renames.

Policy `member-rename-v1` (uaind 0.4.3, chain/federation/member_rename.go): a
licensed member may change its own public name up to five times; each change is
an immutable public record member_rename/<address>/<n> {from, to, height}. The
rule waits for a one-shot guardian record `member_rename_activation`.

This tool does only two things, both from a plan a person reviewed (plan.json):
- `activate`: signs `member_rename_activate` {policy, evidence_digest} with the
  guardian key inside the vault. It mints nothing, moves no AI$ and changes no
  member. Pattern and safety: evidence_window_launch.py (pinned sources, fresh
  pinned proof, journal before broadcast, exact proven receipt, custody lock held
  until inclusion or proved expiry; refused once a guardian epoch exists or the
  guardian set is no longer the single original guardian).
- `prepare N` / `relay N`: for plan.renames[N] it builds the member's own
  `member_rename` {name} from a fresh proof (prepare, printed for the member's
  signer, ops/agents/house-rename.mjs, which holds the member's key elsewhere),
  then takes the member-signed envelope on stdin, checks it against the proved
  member key and the journalled command, broadcasts it once and proves the
  receipt and the rename record (relay). The guardian key is never used for a
  rename and no member key reaches this host.

Usage (root, isolated interpreter, pinned sources):
  member_rename_launch.py status
  member_rename_launch.py activate
  member_rename_launch.py prepare N
  member_rename_launch.py relay N  < envelope.json
"""
import base64,hashlib,json,os,re,sys,time,resource,stat,types
from pathlib import Path
SOURCE_MANIFEST=Path('/etc/uain-custody/member-rename-launch-sources.json')
SOURCE_NAMES=('native_migration','guardian_quorum','native_admission','holder_release','central_reviewer','custody','member_rename_launch')
def source_read(path):
 path=Path(path);require_source(path.resolve()==path)
 for parent in path.parents:
  info=parent.stat();require_source(stat.S_ISDIR(info.st_mode) and info.st_uid==0 and not info.st_mode&0o022)
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  info=os.fstat(fd);require_source(stat.S_ISREG(info.st_mode) and info.st_uid==0 and not info.st_mode&0o022 and info.st_nlink==1 and 0<info.st_size<=1024*1024)
  with os.fdopen(fd,'rb',closefd=False) as stream:raw=stream.read(1024*1024+1)
  after=os.fstat(fd);require_source(len(raw)==info.st_size and (info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns,info.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns))
  return raw
 finally:os.close(fd)
def require_source(value):
 if not value:raise ValueError('Pinned member-rename launch source refused')
def bootstrap_sources(directory=None,manifest=None):
 require_source(os.geteuid()==0);sys.dont_write_bytecode=True
 directory=Path(__file__).absolute().parent if directory is None else Path(directory)
 manifest=SOURCE_MANIFEST if manifest is None else Path(manifest)
 def unique(pairs):
  value={}
  for key,item in pairs:require_source(key not in value);value[key]=item
  return value
 approved=json.loads(source_read(manifest),object_pairs_hook=unique)
 require_source(type(approved)==dict and set(approved)=={'schema','sha256'} and approved['schema']=='uain-member-rename-launch-sources-v1')
 pins=approved['sha256'];require_source(type(pins)==dict and set(pins)=={name+'.py' for name in SOURCE_NAMES})
 sources={}
 for name in SOURCE_NAMES:
  raw=source_read(directory/(name+'.py'));pin=pins[name+'.py']
  require_source(type(pin)==str and re.fullmatch('[a-f0-9]{64}',pin) and hashlib.sha256(raw).hexdigest()==pin)
  sources[name]=compile(raw,str(directory/(name+'.py')),'exec',dont_inherit=True)
 for name in SOURCE_NAMES[:-1]:
  module=types.ModuleType(name);module.__file__=str(directory/(name+'.py'));sys.modules[name]=module
  exec(sources[name],module.__dict__)
 return approved
def disable_core():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
if __name__=='__main__':
 require_source(sys.flags.isolated);disable_core();bootstrap_sources()
import native_migration as native
import native_admission as admission

CHAIN=native.CHAIN;GENESIS=native.GENESIS;GUARDIAN=native.GUARDIAN
READER_SHA='136698192e9e38323a552f1e2da2eea5b9b90e3d6e7de11116d72ee28c826860'
PUBLIC='mDuiMoDUKg66PitMD-j1pztm81wOKlYq7nFFCWLXoRI'
POLICY='member-rename-v1'
ACTIVATE='member_rename_activate'
RENAME='member_rename'
MAX_RENAMES=5
ROOT=Path('/var/lib/uain-custody/member-rename-20261120')
HASH=re.compile(r'^[a-f0-9]{64}$');UINT=re.compile(r'^(0|[1-9][0-9]{0,19})$');ADDRESS=re.compile(r'^uain1[a-f0-9]{40}$');KEY=re.compile(r'^[A-Za-z0-9_-]{43}$')
KEYS=['guardians','guardian_epoch_current','member_rename_activation']
BATCH=16
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def require(v):
 if not v:raise ValueError('Bounded member-rename launch refused')
def exact(v,fields):return type(v)==dict and set(v)==set(fields)
def number(v):require(type(v)==str and UINT.fullmatch(v));return int(v)
def valid_name(n):
 # The chain's validMemberName, plus no double quote so the name is safe in an agent prompt.
 return type(n)==str and n==n.strip() and 2<=len(n.encode())<=120 and not any(ord(c)<32 or 127<=ord(c)<=159 or c=='"' or 0xd800<=ord(c)<=0xdfff for c in n)
def tx_hash(e):return sha(json.dumps(e,separators=(',',':')).encode()).upper()

def validate(p):
 """plan.json: reviewed by a person before any send."""
 require(exact(p,{'schema','chain_id','genesis_sha256','policy','evidence_digest','renames'}))
 require(p['schema']=='uain-member-rename-launch-v1' and p['chain_id']==CHAIN and p['genesis_sha256']==GENESIS and p['policy']==POLICY)
 require(type(p['evidence_digest'])==str and HASH.fullmatch(p['evidence_digest']))
 r=p['renames'];require(type(r)==list and 1<=len(r)<=16 and len({x.get('member') for x in r if type(x)==dict})==len(r))
 for x in r:require(exact(x,{'member','from','to'}) and ADDRESS.fullmatch(x['member']) and x['member']!=GUARDIAN and valid_name(x['from']) and valid_name(x['to']) and x['from']!=x['to'])
 return p
def proof_policy(p):
 require(p['chain_id']==CHAIN and p['genesis_sha256']==GENESIS and p['state_sha256']==READER_SHA and p['guardian']==GUARDIAN and p['guardian_public_key']==PUBLIC)
 return p
def fresh(s,now,member=GUARDIAN,public=PUBLIC):
 require(s['chain_id']==CHAIN and type(s['app_hash'])==str and HASH.fullmatch(s['app_hash']))
 import datetime
 t=datetime.datetime.fromisoformat(s['header_time'].replace('Z','+00:00'));require(t.tzinfo is not None and -60<=now-t.timestamp()<=120)
 h=number(s['height']);require(0<h<9223372036854775707);number(s['event_count'])
 m=s['member'];require(m['id']==member and type(m['public_key'])==str and KEY.fullmatch(m['public_key']) and m['licence']=='active' and number(m['sequence'])<18446744073709551615)
 require(public is None or m['public_key']==public)
 require('uain1'+sha(base64.urlsafe_b64decode(m['public_key']+'='))[:40]==member)
 r=s['records'];require('guardians' in r and GUARDIAN in r['guardians'])
 return h,r,m
def activation(r):
 """The proved activation record, strictly shaped, or None."""
 a=r['member_rename_activation']
 if a is None:return None
 require(exact(a,{'policy','height','approved_by','evidence_digest'}) and a['policy']==POLICY and a['approved_by']==GUARDIAN and HASH.fullmatch(a['evidence_digest']))
 return dict(height=number(a['height']),evidence_digest=a['evidence_digest'])

def activate_command(p,s,now=None):
 now=time.time() if now is None else now;validate(p);h,r,m=fresh(s,now)
 # Only while the original guardian alone still governs, and only once.
 require(activation(r) is None and r['guardian_epoch_current'] is None and r['guardians']==[GUARDIAN])
 payload=dict(policy=POLICY,evidence_digest=p['evidence_digest'])
 return dict(version=1,chain_id=CHAIN,member=GUARDIAN,sequence=m['sequence'],expires_height=str(h+100),operation=ACTIVATE,payload=payload)
command=activate_command
def matches(e,c,subject):return type(e)==dict and e.get('member')==c['member'] and e.get('operation')==c['operation'] and e.get('subject')==subject and e.get('command_digest')==sha(native.signing_bytes(c)) and not e.get('instance') and not e.get('origin')
def sign(custody,c):
 require(c['operation']==ACTIVATE and c['member']==GUARDIAN)
 key=native.strict_json(custody.attachment(custody.vault(),'keys/uain-review-key.json'));seed=bytearray(admission.public_key(key['private_key']))
 try:
  pub,signer=native.ed25519(bytes(seed));public=base64.urlsafe_b64encode(pub).decode().rstrip('=')
  require(public==key['public_key']==PUBLIC and 'uain1'+sha(pub)[:40]==GUARDIAN)
  envelope=dict(command=c,public_key=public,signature=base64.urlsafe_b64encode(signer(native.signing_bytes(c))).decode().rstrip('='))
  admission.verify_envelope(dict(guardian_public_key=PUBLIC),envelope,c);return envelope
 finally:
  for n in range(len(seed)):seed[n]=0
def plan_digest(p):return sha(native.canonical(validate(p)).encode())

def rename_keys(member):return [*KEYS,'member_metadata/'+member,*('member_rename/%s/%d'%(member,n) for n in range(1,MAX_RENAMES+1))]
def rename_command(p,index,s,now=None):
 """The member's own rename, only while the rule is active and the member still has the reviewed old name."""
 now=time.time() if now is None else now;validate(p);require(type(index)==int and 0<=index<len(p['renames']))
 x=p['renames'][index];h,r,m=fresh(s,now,member=x['member'],public=None)
 a=activation(r);require(a is not None and h>=a['height'])
 require(m['name']==x['from'] and m['name']!=x['to'])
 used=[n for n in range(1,MAX_RENAMES+1) if r['member_rename/%s/%d'%(x['member'],n)] is not None];require(used==list(range(1,len(used)+1)) and len(used)<MAX_RENAMES)
 return dict(version=1,chain_id=CHAIN,member=x['member'],sequence=m['sequence'],expires_height=str(h+100),operation=RENAME,payload=dict(name=x['to']))

def scan(j,c,e,subject,runtime,write,path,reader):
 """Look for the exact proven event after the journalled cursor; prove non-inclusion after expiry."""
 s=runtime.read(dict(member=reader,keys=[]));cursor=number(j['cursor']);count=number(s['event_count']);require(number(j['after_event'])<=cursor<=count)
 end=min(count,cursor+BATCH);selected=[admission.event_key(n) for n in range(cursor+1,end+1)]
 if selected:
  s=runtime.read(dict(member=reader,keys=selected))
  for k in selected:
   event=s['records'][k];require(type(event)==dict and admission.event_key(number(event['id']))==k)
   if event.get('command_digest')!=sha(native.signing_bytes(c)):continue
   require(matches(event,c,subject));proved=runtime.read(dict(member=reader,keys=[],receipt=dict(envelope=e,event_id=event['id'])));receipt=proved['receipt']
   require(receipt['authority']=='native' and receipt['finalized'] is True and receipt['chain_id']==CHAIN and receipt['state_height']==proved['height'] and receipt['app_hash']==proved['app_hash'] and receipt['event']==event and number(proved['member']['sequence'])>number(c['sequence']))
   j['receipt']=receipt;write(path,j);return dict(status='finalized',receipt_event=event['id'])
 j['cursor']=str(end)
 if end==number(s['event_count']) and number(s['height'])>number(c['expires_height']):
  j['noninclusion']=dict(command_digest=sha(native.signing_bytes(c)),through_event=str(end),height=s['height'],app_hash=s['app_hash'])
  write(path,j);return dict(status='expired_not_included',broadcast_code=j.get('broadcast_code'))
 write(path,j);return dict(status='pending',broadcast_code=j.get('broadcast_code'))
def send_once(j,e,expected,runtime,write,path,reader,keys):
 """Broadcast at most once, and only while the command is unexpired and its sequence unused."""
 c=e['command']
 if not j['attempted']:
  s=runtime.read(dict(member=reader,keys=keys))
  if number(s['height'])<number(c['expires_height']) and s['member']['sequence']==c['sequence']:
   again=expected(s);require({k:v for k,v in c.items() if k!='expires_height'}=={k:v for k,v in again.items() if k!='expires_height'})
   j['attempted']=True;write(path,j)
   try:j['broadcast_code']=runtime.broadcast(e)
   except Exception:j['broadcast_code']=None
   write(path,j)
def archive(path,j,write):
 attempts=j.get('attempts',1);write(path.with_name(path.stem+'.expired-'+str(attempts)+'.json'),j);return attempts

def process(p,runtime,load,write,signer,now=time.time):
 """The guardian activation, send-once. The caller holds the global custody lock."""
 path=ROOT/'journal'/'activate.json';digest=plan_digest(p);j=load(path)
 if j is not None and j.get('noninclusion') is not None:attempts=archive(path,j,write);j=None
 else:attempts=0 if j is None else j.get('attempts',1)
 if j is None:
  s=runtime.read(dict(member=GUARDIAN,keys=KEYS));c=activate_command(p,s,now=now());e=signer(c)
  admission.verify_envelope(dict(guardian_public_key=PUBLIC),e,c)
  j=dict(schema='uain-member-rename-activate-once-v1',plan_digest=digest,envelope=e,after_event=s['event_count'],cursor=s['event_count'],attempted=False,attempts=attempts+1)
  write(path,j)
 require(j['schema']=='uain-member-rename-activate-once-v1' and j['plan_digest']==digest)
 e=j['envelope'];c=e['command'];admission.verify_envelope(dict(guardian_public_key=PUBLIC),e,c);require(c['operation']==ACTIVATE)
 if j.get('receipt') is not None:return dict(status='finalized',receipt_event=j['receipt']['event']['id'],tx_hash=tx_hash(e))
 send_once(j,e,lambda s:activate_command(p,s,now=now()),runtime,write,path,GUARDIAN,KEYS)
 out=scan(j,c,e,POLICY,runtime,write,path,GUARDIAN);out['tx_hash']=tx_hash(e);return out

def rename_path(p,index):return ROOT/'journal'/('rename-'+p['renames'][index]['member']+'.json')
def prepare(p,index,runtime,load,write,now=time.time):
 """Build and journal the member's command for its own signer. Nothing is signed here."""
 path=rename_path(p,index);digest=plan_digest(p);x=p['renames'][index];j=load(path)
 if j is not None and j.get('noninclusion') is not None:attempts=archive(path,j,write);j=None
 else:attempts=0 if j is None else j.get('attempts',1)
 if j is not None:
  # Never a second command while one may still be in flight: hand back the same one.
  require(j['schema']=='uain-member-rename-once-v1' and j['plan_digest']==digest and j['member']==x['member'] and j.get('receipt') is None);return j['command']
 s=runtime.read(dict(member=x['member'],keys=rename_keys(x['member'])));c=rename_command(p,index,s,now=now())
 write(path,dict(schema='uain-member-rename-once-v1',plan_digest=digest,member=x['member'],command=c,after_event=s['event_count'],cursor=s['event_count'],attempted=False,attempts=attempts+1))
 return c
def relay(p,index,envelope,runtime,load,write,now=time.time):
 path=rename_path(p,index);digest=plan_digest(p);x=p['renames'][index];j=load(path)
 require(j is not None and j['schema']=='uain-member-rename-once-v1' and j['plan_digest']==digest and j['member']==x['member'] and j.get('noninclusion') is None)
 c=j['command'];keys=rename_keys(x['member'])
 if j.get('envelope') is None:
  require(type(envelope)==dict and envelope.get('command')==c)
  s=runtime.read(dict(member=x['member'],keys=keys));h,r,m=fresh(s,now(),member=x['member'],public=None)
  admission.verify_envelope(dict(guardian_public_key=m['public_key']),envelope,c);j['envelope']=envelope;write(path,j)
 e=j['envelope'];require(envelope is None or envelope==e)
 admission.verify_envelope(dict(guardian_public_key=e['public_key']),e,c);require(c['operation']==RENAME and c['member']==x['member'])
 if j.get('receipt') is None:
  send_once(j,e,lambda s:rename_command(p,index,s,now=now()),runtime,write,path,x['member'],keys)
  out=scan(j,c,e,x['member'],runtime,write,path,x['member'])
  if out['status']!='finalized':out['tx_hash']=tx_hash(e);return out
 # Prove the public rename record and the member's new name.
 s=runtime.read(dict(member=x['member'],keys=rename_keys(x['member'])));h,r,m=fresh(s,now(),member=x['member'],public=e['public_key'])
 records=[r['member_rename/%s/%d'%(x['member'],n)] for n in range(1,MAX_RENAMES+1)];found=[v for v in records if v is not None and v.get('to')==x['to'] and v.get('from')==x['from']]
 require(len(found)==1 and m['name']==x['to'] and r['member_metadata/'+x['member']]['name']==x['to'])
 v=found[0];return dict(status='finalized',member=x['member'],from_name=v['from'],to_name=v['to'],record='member_rename/%s/%d'%(x['member'],v['number']),height=v['height'],receipt_event=j['receipt']['event']['id'],tx_hash=tx_hash(e))

def run(stage,index=None,stdin=None):
 require(os.geteuid()==0 and stage in ('status','activate','prepare','relay'));disable_core();os.umask(0o077)
 import central_reviewer as locking
 import custody
 admission.ensure_directory(ROOT);admission.ensure_directory(ROOT/'journal')
 admission.TEMP=ROOT/'proofs';admission.ensure_directory(admission.TEMP);policy=proof_policy(admission.load(admission.POLICY))
 journal=lambda path:admission.load(path) if path.exists() else None
 if stage=='status':
  s=admission.Runtime(policy).read(dict(member=GUARDIAN,keys=KEYS));r=s['records']
  return dict(height=s['height'],app_hash=s['app_hash'],activation=activation(r),guardians=r['guardians'],guardian_epoch=r['guardian_epoch_current'])
 p=validate(admission.load(ROOT/'plan.json'))
 if stage=='prepare':return prepare(p,index,admission.Runtime(policy),journal,admission.atomic)
 if stage=='relay':
  envelope=native.strict_json(stdin) if stdin else None
  out=relay(p,index,envelope,admission.Runtime(policy),journal,admission.atomic)
  for _ in range(15):
   if out['status']!='pending':break
   time.sleep(3);out=relay(p,index,None,admission.Runtime(policy),journal,admission.atomic)
  return out
 with locking.locked():
  out=process(p,admission.Runtime(policy),journal,admission.atomic,lambda c:sign(custody,c))
  # Keep the custody lock until the command is included or expires, so no other
  # guardian tool reads the same sequence while this one is still in the mempool.
  for _ in range(15):
   if out['status']!='pending':break
   time.sleep(3);out=process(p,admission.Runtime(policy),journal,admission.atomic,lambda c:sign(custody,c))
  return out
if __name__=='__main__':
 try:
  require(len(sys.argv) in (2,3))
  stage=sys.argv[1];index=int(sys.argv[2]) if len(sys.argv)==3 else None
  require((stage in ('prepare','relay'))==(index is not None))
  stdin=sys.stdin.buffer.read(65536) if stage=='relay' and not sys.stdin.isatty() else None
  print(json.dumps(run(stage,index,stdin),separators=(',',':')))
 except Exception as error:print(json.dumps(dict(status='refused',error_type=type(error).__name__)),file=sys.stderr);sys.exit(1)
