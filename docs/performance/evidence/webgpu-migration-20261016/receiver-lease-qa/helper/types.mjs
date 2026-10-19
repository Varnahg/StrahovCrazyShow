import ts from './node_modules/typescript/lib/typescript.js';
import {dirname,resolve}from'node:path';import{fileURLToPath}from'node:url';
const root=dirname(fileURLToPath(import.meta.url));process.chdir(root);const config=ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile);
if(config.error)throw Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
const options=ts.parseJsonConfigFileContent(config.config,ts.sys,root).options;
const program=ts.createProgram(['client/qa-receiver-lease.ts','client/qa-stable-light-state.ts','tests/qa-receiver-lease.test.ts','replay.ts'].map(p=>resolve(root,p)),{...options,noEmit:true});
const errors=ts.getPreEmitDiagnostics(program);console.log(ts.formatDiagnostics(errors,{getCurrentDirectory:()=>root,getCanonicalFileName:p=>p,getNewLine:()=> '\n'}));console.log(JSON.stringify({files:program.getSourceFiles().length,errors:errors.length}));process.exitCode=errors.length?1:0;
