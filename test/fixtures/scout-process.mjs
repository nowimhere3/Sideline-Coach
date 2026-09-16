const args = process.argv.slice(2);
const read = (flag) => args[args.indexOf(flag) + 1];
const id = read('--scout-id');
const delay = Number(read('--delay'));
const fail = args.includes('--fail');

process.stdout.write(`REPORT TYPE: SCOUT REPORT\nSCOUT ID: ${id}\nOUTPUT TOKEN: only-${id}\n`);
process.stderr.write(`stderr-${id}\n`);
setTimeout(() => {
  process.stdout.write(`finished-${id}\n`);
  process.exitCode = fail ? 7 : 0;
}, delay);
