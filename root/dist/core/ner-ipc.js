import { fork } from 'node:child_process';
import path from 'node:path';
let child = null;
export async function nerIPC(text) {
    if (!child) {
        const workerPath = path.resolve(__dirname, '../../scripts/ner-worker.ts');
        child = fork(workerPath, [], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
        await new Promise((res) => child.once('message', () => res(null)));
    }
    return new Promise((res, rej) => {
        const onMsg = (m) => {
            if (m?.ok) {
                child.off('message', onMsg);
                res(m.out);
            }
            else if (m?.ok === false) {
                child.off('message', onMsg);
                rej(new Error(m.err));
            }
        };
        child.on('message', onMsg);
        child.send({ cmd: 'ner', text });
    });
}
