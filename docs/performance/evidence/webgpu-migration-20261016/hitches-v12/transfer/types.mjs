import ts from '../inactive-light-defines-qa-20261018/dependencies/node_modules/typescript/lib/typescript.js';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),candidate=resolve(root,'candidate');
const config=ts.readConfigFile(resolve(candidate,'tsconfig.json'),ts.sys.readFile);if(config.error)throw Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
const options=ts.parseJsonConfigFileContent(config.config,ts.sys,candidate).options,program=ts.createProgram(['tests/inactive-light-defines-helper.test.ts','tests/inactive-light-defines-history.test.ts'].map(p=>resolve(candidate,p)),{...options,noEmit:true});
const errors=ts.getPreEmitDiagnostics(program);console.log(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>candidate,getCanonicalFileName:p=>p,getNewLine:()=> '\n'}));console.log(JSON.stringify({files:program.getSourceFiles().length,errors:errors.length}));process.exitCode=errors.length?1:0;
