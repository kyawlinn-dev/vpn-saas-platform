import {describe,it,expect,vi} from 'vitest';
import {createBotContentMiddleware} from '../bot/contentMiddleware.js';
import {createBotCopy} from '../bot/contentBindings.js';

describe('Telegram per-update middleware',()=>{
  it('loads once for its bound reseller, exposes a consistent snapshot, then reloads next update',async()=>{
    const copy=createBotCopy(),load=vi.fn().mockResolvedValueOnce({MENU_HOME:'First'}).mockResolvedValueOnce({MENU_HOME:'Second'});
    const middleware=createBotContentMiddleware({resellerId:'one',load});
    const values=[];
    await middleware({},async()=>{values.push(copy.MENU_HOME);await Promise.resolve();values.push(copy.MENU_HOME);});
    await middleware({},async()=>{values.push(copy.MENU_HOME);});
    expect(values).toEqual(['First','First','Second']);expect(load.mock.calls).toEqual([['one'],['one']]);
  });
  it('keeps delivering content when command sync is temporarily unavailable',async()=>{
    const next=vi.fn();const middleware=createBotContentMiddleware({resellerId:'one',load:async()=>({}),syncCommands:async()=>{throw Error('offline');}});
    await middleware({},next);expect(next).toHaveBeenCalledOnce();
  });
  it('does not hold customer responses behind an optional command-description sync',async()=>{
    let finish;const syncCommands=()=>new Promise(resolve=>{finish=resolve;});
    const next=vi.fn(),middleware=createBotContentMiddleware({resellerId:'one',load:async()=>({}),syncCommands});
    const running=middleware({},next);await Promise.resolve();await Promise.resolve();
    try{expect(next).toHaveBeenCalledOnce();}finally{finish({status:'pending'});await running;}
  });
});
