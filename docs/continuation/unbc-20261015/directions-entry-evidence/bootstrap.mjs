import {Window} from './dependencies/node_modules/happy-dom/lib/index.js';
const window=new Window({url:'http://component-test.invalid/'});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','Element','Node','Event','MouseEvent','KeyboardEvent','FocusEvent','MutationObserver','ResizeObserver','CustomEvent','DOMException','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']){
  const value=key==='window'?window:window[key];
  if(value!==undefined)Object.defineProperty(globalThis,key,{value:typeof value==='function'&&['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key)?value.bind(window):value,configurable:true,writable:true});
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await import('./probe.bundle.mjs');
await window.happyDOM.abort();
window.close();
// React's DOM scheduler may retain Node MessagePorts in a simulated window.
// All assertions and source-preservation checks completed before this exit.
process.exit(0);
