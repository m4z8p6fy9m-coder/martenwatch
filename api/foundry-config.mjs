import {FoundryProvider} from './foundry.mjs';
// Merely setting an endpoint never enables network calls or spending.
export function foundryFromEnv(env,options={}) {
 if(env.FOUNDRY_ENABLE_PAID_CALLS!=='true')return null;
 if(!env.FOUNDRY_PROJECT_ENDPOINT||!env.FOUNDRY_AGENT_NAME)throw new Error('Foundry opt-in requires a project endpoint and agent name');
 return new FoundryProvider({endpoint:env.FOUNDRY_PROJECT_ENDPOINT,agentName:env.FOUNDRY_AGENT_NAME,...options});
}
