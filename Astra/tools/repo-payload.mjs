// Read explicit Astra files for the GitHub connector when this workspace has
// no .git metadata. This does not create a repository or change remote history.
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [file,offset,length]=process.argv.slice(2),root=process.cwd(),resolved=path.resolve(file??'');
if(!resolved.startsWith(root+path.sep)||/(^|[\\/])(node_modules|\.env[^\\/]*|\.git)([\\/]|$)/.test(file))throw Error('Only explicit project files may be published');
const data=await readFile(resolved);
if(offset===undefined)console.log(JSON.stringify({bytes:(await stat(resolved)).size,sha:createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex')}));
else process.stdout.write(data.subarray(Number(offset),Number(offset)+Number(length)).toString('base64'));
