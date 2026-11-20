import base64,copy,datetime,hashlib,importlib.util,unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('member_rename_launch',Path(__file__).with_name('member_rename_launch.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
PUB=base64.urlsafe_b64encode(b'\x07'*32).decode().rstrip('=')
MEMBER='uain1'+hashlib.sha256(b'\x07'*32).hexdigest()[:40]
OTHER='uain1'+'a'*40

class Base(unittest.TestCase):
 def setUp(self):
  self.now=1795132800
  self.plan=dict(schema='uain-member-rename-launch-v1',chain_id=m.CHAIN,genesis_sha256=m.GENESIS,policy=m.POLICY,evidence_digest='e'*64,
   renames=[dict(member=MEMBER,**{'from':'Halcyon','to':'Nora Quill'})])
  self.records={'guardians':[m.GUARDIAN],'guardian_epoch_current':None,'member_rename_activation':None,'member_metadata/'+MEMBER:dict(id=MEMBER,name='Halcyon')}
  for n in range(1,6):self.records['member_rename/%s/%d'%(MEMBER,n)]=None
  self.journals={};self.sequence='7';self.name='Halcyon'
  m.admission.verify_envelope=lambda p,e,c:None
 def state(self,member=None,height='100',events='20'):
  member=member or m.GUARDIAN;guardian=member==m.GUARDIAN
  return dict(chain_id=m.CHAIN,height=height,header_time=datetime.datetime.fromtimestamp(self.now,datetime.timezone.utc).isoformat(),event_count=events,app_hash='b'*64,
   member=dict(id=member,public_key=m.PUBLIC if guardian else PUB,licence='active',sequence=self.sequence,name='' if guardian else self.name),records=copy.deepcopy(self.records))
 def load(self,p):return copy.deepcopy(self.journals.get(str(p)))
 def write(self,p,v):self.journals[str(p)]=copy.deepcopy(v)

class ActivationTest(Base):
 def test_activation_is_fixed(self):
  c=m.activate_command(self.plan,self.state(),now=self.now)
  self.assertEqual((c['member'],c['operation'],c['sequence'],c['expires_height']),(m.GUARDIAN,'member_rename_activate','7','200'))
  self.assertEqual(c['payload'],dict(policy='member-rename-v1',evidence_digest='e'*64))
 def test_refused_twice_after_handover_or_stale(self):
  for change in ('active','epoch','second_guardian','stale','unlicensed'):
   self.setUp()
   if change=='active':self.records['member_rename_activation']=dict(policy=m.POLICY,height='60',approved_by=m.GUARDIAN,evidence_digest='e'*64)
   if change=='epoch':self.records['guardian_epoch_current']={'epoch':1}
   if change=='second_guardian':self.records['guardians']=[m.GUARDIAN,OTHER]
   s=self.state()
   if change=='stale':s['header_time']='2020-01-01T00:00:00+00:00'
   if change=='unlicensed':s['member']['licence']='revoked'
   with self.subTest(change=change),self.assertRaises((ValueError,TypeError,AttributeError)):m.activate_command(self.plan,s,now=self.now)
 def test_plan_is_exact(self):
  for change in ('extra','policy','digest','chain','same_name','guardian','duplicate','quote','spaces'):
   p=copy.deepcopy(self.plan)
   if change=='extra':p['mint']='1'
   if change=='policy':p['policy']='member-rename-v2'
   if change=='digest':p['evidence_digest']='E'*64
   if change=='chain':p['chain_id']='other'
   if change=='same_name':p['renames'][0]['to']='Halcyon'
   if change=='guardian':p['renames'][0]['member']=m.GUARDIAN
   if change=='duplicate':p['renames'].append(dict(p['renames'][0],to='Theo'))
   if change=='quote':p['renames'][0]['to']='a"b'
   if change=='spaces':p['renames'][0]['to']=' Nora'
   with self.subTest(change=change),self.assertRaises((ValueError,TypeError,AttributeError)):m.validate(p)
 def test_send_once_then_finalized_by_exact_event(self):
  outer=self
  class Runtime:
   broadcasts=0;event=None
   def read(self,sel):
    s=outer.state(events='21' if self.event else '20')
    for k in sel['keys']:
     if k.startswith('event/'):s['records'][k]=self.event if k==m.admission.event_key(21) else dict(id=k.split('/')[1].lstrip('0'),operation='other')
    if 'receipt' in sel:s['member']['sequence']='8';s['receipt']=dict(authority='native',finalized=True,chain_id=m.CHAIN,state_height=s['height'],app_hash=s['app_hash'],event=self.event)
    return s
   def broadcast(self,e):
    self.broadcasts+=1;c=e['command']
    self.event=dict(id='21',member=m.GUARDIAN,operation=c['operation'],subject=m.POLICY,command_digest=m.sha(m.native.signing_bytes(c)))
    return 0
  rt=Runtime();signer=lambda c:dict(command=c,public_key=m.PUBLIC,signature='s'*86)
  out=m.process(self.plan,rt,self.load,self.write,signer,now=lambda:self.now)
  self.assertEqual(out['status'],'finalized');self.assertEqual(rt.broadcasts,1)
  self.assertEqual(m.process(self.plan,rt,self.load,self.write,signer,now=lambda:self.now)['status'],'finalized');self.assertEqual(rt.broadcasts,1)
  with self.assertRaises(ValueError):m.process(dict(self.plan,evidence_digest='f'*64),rt,self.load,self.write,signer,now=lambda:self.now)

class RenameTest(Base):
 def setUp(self):
  super().setUp();self.records['member_rename_activation']=dict(policy=m.POLICY,height='90',approved_by=m.GUARDIAN,evidence_digest='e'*64)
 def runtime(self):
  outer=self
  class Runtime:
   broadcasts=0;event=None
   def read(self,sel):
    s=outer.state(member=sel['member'],events='21' if self.event else '20')
    for k in sel['keys']:
     if k.startswith('event/'):s['records'][k]=self.event if k==m.admission.event_key(21) else dict(id=k.split('/')[1].lstrip('0'),operation='other')
    if 'receipt' in sel:s['member']['sequence']='8';s['receipt']=dict(authority='native',finalized=True,chain_id=m.CHAIN,state_height=s['height'],app_hash=s['app_hash'],event=self.event)
    return s
   def broadcast(self,e):
    self.broadcasts+=1;c=e['command']
    self.event=dict(id='21',member=MEMBER,operation='member_rename',subject=MEMBER,command_digest=m.sha(m.native.signing_bytes(c)))
    outer.records['member_rename/%s/1'%MEMBER]=dict(member=MEMBER,number=1,**{'from':'Halcyon','to':'Nora Quill'},height='101',previous_digest='d'*64)
    outer.records['member_metadata/'+MEMBER]=dict(id=MEMBER,name='Nora Quill');outer.name='Nora Quill';outer.sequence='8'
    return 0
  return Runtime()
 def test_prepare_builds_the_members_own_command_and_is_stable(self):
  rt=self.runtime();c=m.prepare(self.plan,0,rt,self.load,self.write,now=lambda:self.now)
  self.assertEqual(c,dict(version=1,chain_id=m.CHAIN,member=MEMBER,sequence='7',expires_height='200',operation='member_rename',payload=dict(name='Nora Quill')))
  self.now+=30;self.assertEqual(m.prepare(self.plan,0,rt,self.load,self.write,now=lambda:self.now),c)
 def test_prepare_refused_before_activation_wrong_old_name_or_limit(self):
  for change in ('inactive','not_yet','renamed_elsewhere','limit','unlicensed'):
   self.setUp()
   if change=='inactive':self.records['member_rename_activation']=None
   if change=='not_yet':self.records['member_rename_activation']['height']='101'
   if change=='renamed_elsewhere':self.name='Someone'
   if change=='limit':
    for n in range(1,6):self.records['member_rename/%s/%d'%(MEMBER,n)]={'number':n}
   s=self.state(member=MEMBER)
   if change=='unlicensed':s['member']['licence']='pending'
   with self.subTest(change=change),self.assertRaises((ValueError,TypeError,AttributeError)):m.rename_command(self.plan,0,s,now=self.now)
 def test_relay_checks_envelope_broadcasts_once_and_proves_the_record(self):
  rt=self.runtime();c=m.prepare(self.plan,0,rt,self.load,self.write,now=lambda:self.now)
  checked=[];m.admission.verify_envelope=lambda p,e,cmd:checked.append(p['guardian_public_key'])
  e=dict(command=c,public_key=PUB,signature='s'*86)
  with self.assertRaises(ValueError):m.relay(self.plan,0,dict(e,command=dict(c,payload=dict(name='Other'))),rt,self.load,self.write,now=lambda:self.now)
  out=m.relay(self.plan,0,e,rt,self.load,self.write,now=lambda:self.now)
  self.assertEqual(out['status'],'finalized');self.assertEqual(rt.broadcasts,1);self.assertIn(PUB,checked)
  self.assertEqual((out['from_name'],out['to_name'],out['record'],out['height']),('Halcyon','Nora Quill','member_rename/%s/1'%MEMBER,'101'))
  self.assertEqual(out['tx_hash'],m.tx_hash(e))
  again=m.relay(self.plan,0,None,rt,self.load,self.write,now=lambda:self.now)
  self.assertEqual(again['status'],'finalized');self.assertEqual(rt.broadcasts,1)
  with self.assertRaises(ValueError):m.prepare(self.plan,0,rt,self.load,self.write,now=lambda:self.now)
 def test_expired_rename_is_proved_then_prepared_again(self):
  outer=self
  class Runtime:
   broadcasts=0;height='100'
   def read(self,sel):
    s=outer.state(member=sel['member'],height=self.height)
    for k in sel['keys']:
     if k.startswith('event/'):s['records'][k]=dict(id=k.split('/')[1].lstrip('0'),operation='other')
    return s
   def broadcast(self,e):self.broadcasts+=1;return 5
  rt=Runtime();c=m.prepare(self.plan,0,rt,self.load,self.write,now=lambda:self.now)
  self.assertEqual(m.relay(self.plan,0,dict(command=c,public_key=PUB,signature='s'*86),rt,self.load,self.write,now=lambda:self.now)['status'],'pending')
  rt.height='201'
  self.assertEqual(m.relay(self.plan,0,None,rt,self.load,self.write,now=lambda:self.now)['status'],'expired_not_included')
  rt.height='202';fresh=m.prepare(self.plan,0,rt,self.load,self.write,now=lambda:self.now)
  self.assertEqual(fresh['expires_height'],'302');self.assertEqual(rt.broadcasts,1)
  self.assertTrue(any(k.endswith('rename-%s.expired-1.json'%MEMBER) for k in self.journals))

if __name__=='__main__':unittest.main()
