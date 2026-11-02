import {describe,expect,it} from 'vitest';
import {runnerSubscriptionConfig} from '../services/infrastructure/runnerSubscriptionConfig.js';

describe('runner permanent-link configuration',()=>{
  it('copies the explicit DEV subscription base without unrelated credentials',()=>{
    expect(runnerSubscriptionConfig({PUBLIC_SUBSCRIPTION_BASE_URL:'https://dev.example.com',WEBHOOK_BASE_URL:'https://other.example.com',SECRET:'private'}))
      .toEqual({PUBLIC_SUBSCRIPTION_BASE_URL:'https://dev.example.com'});
  });
  it('resolves the same webhook fallback as the permanent-link verifier',()=>{
    expect(runnerSubscriptionConfig({WEBHOOK_BASE_URL:'https://dev.example.com/'}))
      .toEqual({PUBLIC_SUBSCRIPTION_BASE_URL:'https://dev.example.com/'});
  });
  it.each([undefined,'','invalid','http://public.example.com','https://user:password@dev.example.com','https://dev.example.com/?secret=x','https://dev.example.com/#fragment'])('rejects missing or unsafe bases: %s',value=>{
    expect(()=>runnerSubscriptionConfig({PUBLIC_SUBSCRIPTION_BASE_URL:value})).toThrow('RUNNER_SUBSCRIPTION_CONFIGURATION_REQUIRED');
  });
});
