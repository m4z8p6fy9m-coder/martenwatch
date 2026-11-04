import {buildApp} from '../../api/app.mjs';

// Offline test harness only: trusted fixture identities choose physically separate stores.
// This is not a production authenticator or a network service.
export function createTenantLab(){
 const identities=new Map([['token-alpha',{tenant:'alpha',roles:['operator','reviewer']}],['token-beta',{tenant:'beta',roles:['operator','reviewer']}]]);
 const apps=new Map(['alpha','beta'].map(tenant=>[tenant,buildApp({requireIdentity:true,authenticate:async req=>identities.get(req.headers.authorization)??null})]));
 return {
  async request(token,request){const principal=identities.get(token);if(!principal)return {statusCode:401,json:()=>({error:'Authentication required'})};return apps.get(principal.tenant).inject({...request,headers:{...request.headers,authorization:token}});},
  async close(){await Promise.all([...apps.values()].map(app=>app.close()));}
 };
}
