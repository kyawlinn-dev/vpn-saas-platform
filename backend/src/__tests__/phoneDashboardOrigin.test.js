import {afterEach,describe,it,expect,vi} from 'vitest';
import {requireTrustedOrigin} from '../middleware/requireTrustedOrigin.js';

afterEach(()=>vi.unstubAllEnvs());
function request(origin){
  const next=vi.fn(),res={status:vi.fn().mockReturnThis(),json:vi.fn()};
  requireTrustedOrigin({method:'PATCH',headers:{origin}},res,next);
  return {next,res};
}
describe('phone dashboard trusted origin',()=>{
  it('permits a specifically configured hotspot origin without trusting nearby clients',()=>{
    vi.stubEnv('NODE_ENV','development');
    vi.stubEnv('CORS_ALLOWED_ORIGINS','http://localhost:3002,http://172.20.10.2:3002');
    expect(request('http://172.20.10.2:3002').next).toHaveBeenCalledOnce();
    expect(request('http://172.20.10.3:3002').res.status).toHaveBeenCalledWith(403);
    expect(request('http://172.20.10.2:3003').res.status).toHaveBeenCalledWith(403);
  });
  it('does not implicitly allow LAN origins in production or without configuration',()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('CORS_ALLOWED_ORIGINS','http://localhost:3002');
    expect(request('http://172.20.10.2:3002').res.status).toHaveBeenCalledWith(403);
  });
});
