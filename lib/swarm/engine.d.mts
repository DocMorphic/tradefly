import type { SwarmSnapshot } from './types';
export class FlySwarmEngine {
 constructor(seed?:number);
 reset():void;
 tick():SwarmSnapshot;
 snapshot():SwarmSnapshot;
 serialize():Record<string,unknown>;
 static restore(record:Record<string,unknown>):FlySwarmEngine;
 updateConfig(input:{enabled?:boolean;minScore?:number;maxPosition?:number}):SwarmSnapshot;
 setFocus(input:{symbol:string;name?:string;liquidity?:number}):SwarmSnapshot;
}
