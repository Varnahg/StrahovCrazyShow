import ts from './dependencies/node_modules/typescript/lib/typescript.js';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),candidate=resolve(root,'candidate');
const config=ts.readConfigFile(resolve(candidate,'tsconfig.json'),ts.sys.readFile);if(config.error)throw Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
const options=ts.parseJsonConfigFileContent(config.config,ts.sys,candidate).options;
const program=ts.createProgram(['tests/material-defines-serialization.test.ts','tests/material-defines-wgsl-order.test.ts'].map(p=>resolve(candidate,p)),{...options,noEmit:true});
const diagnostics=ts.getPreEmitDiagnostics(program);console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>candidate,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));console.log(JSON.stringify({files:program.getSourceFiles().length,errors:diagnostics.length}));process.exitCode=diagnostics.length?1:0;
