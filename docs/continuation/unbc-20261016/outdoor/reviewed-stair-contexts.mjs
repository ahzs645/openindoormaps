// ISOLATED PROPOSAL. Authoring metadata only; no source-body or route authority.
// The caller must persist the review in source authoring data, not infer it from
// a viewer preference or copy contexts out of an arbitrary derived package.
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const hash = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const contexts = new Set(['outdoor','tiered-seating']);
export function applyReviewedStairContexts(generated, review) {
  if (review===undefined) return generated;
  assert(generated && hash(generated.sourceModelSha256), 'Generated stair inventory needs its source model hash');
  assert(review?.version===1 && review.evidenceKind==='historical-user-review', 'Explicit historical review required');
  assert(hash(review.sourceModelSha256) && review.sourceModelSha256===generated.sourceModelSha256, 'Stair review model mismatch');
  assert(review.origin && typeof review.origin.path==='string' && review.origin.path.length>0 && hash(review.origin.sha256) && hash(review.origin.inventoryDatasetSha256) && /^\d{4}-\d{2}-\d{2}$/.test(review.origin.reviewDate), 'Review origin required');
  assert(Array.isArray(review.entries) && review.entries.length<=1000, 'Review entries required');
  assert(Array.isArray(generated.sourceFlights), 'Generated source flights required');
  const existing=new Map(), desired=new Map();
  for (let i=0;i<generated.sourceFlights.length;i++) {
    const flight=generated.sourceFlights[i];
    assert(flight && Number.isSafeInteger(flight.stairElementId) && flight.stairElementId>0 && !existing.has(flight.stairElementId), 'Unique source assembly identities required');
    existing.set(flight.stairElementId,flight);
  }
  for (let i=0;i<review.entries.length;i++) {
    const entry=review.entries[i];
    assert(entry && Number.isSafeInteger(entry.stairElementId) && entry.stairElementId>0 && contexts.has(entry.context) && !desired.has(entry.stairElementId), 'Unique reviewed identities and supported contexts required');
    const flight=existing.get(entry.stairElementId);
    assert(flight, `Reviewed source assembly missing: ${entry.stairElementId}`);
    assert(Array.isArray(entry.expectedRunElementIds) && entry.expectedRunElementIds.length>0 && entry.expectedRunElementIds.length<=100, 'Reviewed native run identities required');
    for(let n=0;n<entry.expectedRunElementIds.length;n++) assert(Number.isSafeInteger(entry.expectedRunElementIds[n]) && entry.expectedRunElementIds[n]>0 && (n===0 || entry.expectedRunElementIds[n]>entry.expectedRunElementIds[n-1]), 'Sorted unique reviewed native run identities required');
    assert(Array.isArray(flight.runs) && Array.isArray(flight.treads), 'Generated native runs and treads required');
    const runIds=[];for(let n=0;n<flight.runs.length;n++){const id=flight.runs[n]?.runElementId;assert(Number.isSafeInteger(id)&&id>0&&!runIds.includes(id),'Unique generated run identities required');runIds.push(id);}
    const treadIds=new Set();for(let n=0;n<flight.treads.length;n++){const id=flight.treads[n]?.runElementId;assert(Number.isSafeInteger(id)&&id>0,'Native tread run identity required');treadIds.add(id);}
    runIds.sort((a,b)=>a-b);const treadRunIds=[...treadIds].sort((a,b)=>a-b);
    assert(runIds.length===entry.expectedRunElementIds.length && runIds.every((id,n)=>id===entry.expectedRunElementIds[n]),'Reviewed native run identity mismatch');
    assert(treadRunIds.length===entry.expectedRunElementIds.length && treadRunIds.every((id,n)=>id===entry.expectedRunElementIds[n]),'Reviewed native tread owner mismatch');
    assert(flight.context===undefined || flight.context===entry.context, 'Conflicting generated stair context');
    desired.set(entry.stairElementId,entry.context);
  }
  return {...generated,sourceFlights:generated.sourceFlights.map(flight=>desired.has(flight.stairElementId)?{...flight,context:desired.get(flight.stairElementId)}:flight)};
}
