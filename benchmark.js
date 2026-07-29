const groupsToAdd = [1, 2, 3, 4, 5];
const groupsToRemove = [6, 7, 8, 9, 10];

const linkFacilityGroup = async (id) => new Promise(resolve => setTimeout(resolve, 100));
const unlinkFacilityGroup = async (id) => new Promise(resolve => setTimeout(resolve, 100));

async function runSerial() {
  const start = Date.now();
  for (const groupId of groupsToAdd) {
    try { await linkFacilityGroup(groupId); } catch {}
  }
  for (const groupId of groupsToRemove) {
    try { await unlinkFacilityGroup(groupId); } catch {}
  }
  return Date.now() - start;
}

async function runParallel() {
  const start = Date.now();
  const addPromises = groupsToAdd.map(id => linkFacilityGroup(id));
  const removePromises = groupsToRemove.map(id => unlinkFacilityGroup(id));
  await Promise.allSettled([...addPromises, ...removePromises]);
  return Date.now() - start;
}

async function main() {
  console.log('Serial:', await runSerial(), 'ms');
  console.log('Parallel:', await runParallel(), 'ms');
}
main();
