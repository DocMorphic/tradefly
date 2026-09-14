import type {TokenResult,Token,HolderResult} from './types';
export class RobinhoodLive {
 search(query:string):Promise<TokenResult>;
 latest(force?:boolean):Promise<TokenResult>;
 detail(address:string):Promise<Token>;
 holders(address:string):Promise<HolderResult>;
}
