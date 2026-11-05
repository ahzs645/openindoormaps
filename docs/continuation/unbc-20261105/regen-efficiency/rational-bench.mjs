// Run from this directory with the reviter clone beside openindoormaps: node rational-bench.mjs
// Micro-benchmark: Rational normalization and comparison fast paths (results checked identical).
import { Rational, rational, compare } from '../../../../../reviter/lib/reviter/vendor/native-rational-overlay-arithmetic.mjs';
const gcd=(a,b)=>{a=a<0n?-a:a;b=b<0n?-b:b;while(b){const r=a%b;a=b;b=r;}return a;};
const lowbit=x=>x&-x; // x>0
const isPow2=d=>(d&(d-1n))===0n;
// Fast canonical reduction: dyadic denominators via trailing zeros, else Euclid.
function reduceFast(n,d){ if(d<0n){n=-n;d=-d;} if(d===1n)return [n,d]; if(n===0n)return [0n,1n];
  if(isPow2(d)){const an=n<0n?-n:n,l=lowbit(an),g=l<d?l:d;return [n/g,d/g];}
  const g=gcd(n,d);return [n/g,d/g]; }
function reduceOld(n,d){if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return [n/g,d/g];}
// Realistic operands: campus feet coordinates as IEEE doubles -> dyadic rationals.
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const xs=Array.from({length:4000},()=>-900+rnd()*1800);
const R=xs.map(x=>rational(x));
// Products/sums as produced by segment intersection (dyadic * dyadic stays dyadic; quotients are not).
const sums=[],quot=[];for(let i=0;i<R.length-1;i++){const a=R[i],b=R[i+1];sums.push([a.n*b.d+b.n*a.d,a.d*b.d]);quot.push([a.n*b.d-b.n*a.d,(a.d*b.d)*3n+1n]);}
function time(label,f,reps=20){f();const t=performance.now();for(let r=0;r<reps;r++)f();const ms=(performance.now()-t)/reps;console.log(label.padEnd(46),ms.toFixed(2),'ms');return ms;}
for(const [n,d] of [...sums,...quot]){const a=reduceOld(n,d),b=reduceFast(n,d);if(a[0]!==b[0]||a[1]!==b[1])throw Error('mismatch');}
const o1=time('reduce dyadic sums: Euclid gcd',()=>{for(const [n,d] of sums)reduceOld(n,d);});
const f1=time('reduce dyadic sums: trailing-zero fast path',()=>{for(const [n,d] of sums)reduceFast(n,d);});
const o2=time('reduce non-dyadic quotients: Euclid gcd',()=>{for(const [n,d] of quot)reduceOld(n,d);});
const f2=time('reduce non-dyadic quotients: fast path check',()=>{for(const [n,d] of quot)reduceFast(n,d);});
// Comparisons between original coordinates: IEEE compare is exact when both carry their original double.
const cmpFast=(a,b)=>a.original!==undefined&&b.original!==undefined?(a.original<b.original?-1:a.original>b.original?1:0):a.d===b.d?(a.n<b.n?-1:a.n>b.n?1:0):compare(a,b);
for(let i=0;i<R.length-1;i++)if(compare(R[i],R[i+1])!==cmpFast(R[i],R[i+1]))throw Error('cmp mismatch');
const o3=time('compare original coordinates: cross-multiply',()=>{for(let i=0;i<R.length-1;i++)compare(R[i],R[i+1]);});
const f3=time('compare original coordinates: IEEE fast path',()=>{for(let i=0;i<R.length-1;i++)cmpFast(R[i],R[i+1]);});
const G=quot.map(([n,d])=>new Rational(n,d));
const o4=time('compare generated rationals: cross-multiply',()=>{for(let i=0;i<G.length-1;i++)compare(G[i],G[i+1]);});
const f4=time('compare generated: sign/IEEE-interval prefilter',()=>{for(let i=0;i<G.length-1;i++){const a=G[i],b=G[i+1];const sa=a.n<0n?-1:a.n>0n?1:0,sb=b.n<0n?-1:b.n>0n?1:0;if(sa!==sb)continue;const fa=Number(a.n)/Number(a.d),fb=Number(b.n)/Number(b.d);if(Math.abs(fa-fb)>1e-9*Math.max(1,Math.abs(fa)))continue;compare(a,b);}});
console.log(JSON.stringify({dyadicReduceSpeedup:(o1/f1).toFixed(1),nonDyadicOverhead:(f2/o2).toFixed(2),originalCompareSpeedup:(o3/f3).toFixed(1),generatedComparePrefilterSpeedup:(o4/f4).toFixed(1)}));
