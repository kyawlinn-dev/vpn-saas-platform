import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'./pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db=new PGlite();
try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.resellers(id uuid primary key);
    insert into resellers values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
  const sql=await fs.readFile(new URL('../../../supabase/migrations/0058_telegram_bot_content.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  for(const role of ['anon','authenticated']){
    const {rows}=await db.query("select has_table_privilege($1,'public.reseller_bot_content','SELECT') allowed",[role]);
    assert.equal(rows[0].allowed,false);
  }
  await db.exec('set role service_role');
  await db.query('insert into reseller_bot_content(reseller_id,content_key,custom_text) values($1,$2,$3)', ['11111111-1111-4111-8111-111111111111','MENU_HOME','မင်္ဂလာပါ']);
  await db.query('insert into reseller_bot_content(reseller_id,content_key,custom_text) values($1,$2,$3)', ['22222222-2222-4222-8222-222222222222','MENU_HOME','Other']);
  await assert.rejects(db.query("insert into reseller_bot_content values('11111111-1111-4111-8111-111111111111','MENU_HOME','duplicate',now())"));
  await assert.rejects(db.query("insert into reseller_bot_content values('33333333-3333-4333-8333-333333333333','MENU_HOME','orphan',now())"));
  await assert.rejects(db.query("insert into reseller_bot_content values('11111111-1111-4111-8111-111111111111','invalid key','bad',now())"));
  await assert.rejects(db.query("insert into reseller_bot_content values('11111111-1111-4111-8111-111111111111','TOO_LONG',repeat('x',3001),now())"));
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from reseller_bot_content')).rows[0].n,2);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.reseller_bot_content'::regclass")).rows[0].relrowsecurity,true);
  await db.query("delete from resellers where id='11111111-1111-4111-8111-111111111111'");
  assert.equal((await db.query('select count(*)::int n from reseller_bot_content')).rows[0].n,1);
  console.log('Telegram content synthetic PostgreSQL checks passed (idempotency, grants, RLS, FK, uniqueness, limits, cascade)');
}finally{await db.close();}
