#! /usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*
    Commander Setup
*/
const commander_1 = require("commander"); // (normal include)
const getPkgVer_js_1 = __importDefault(require("./util/getPkgVer.js"));
const sllm_js_1 = __importDefault(require("./sllm.js"));
const sllm = new sllm_js_1.default;
const program = new commander_1.Command();
program
    .name('sllm')
    .description('CLI for OpenAI Large Language Models. v' + getPkgVer_js_1.default + ' \r\nCreated by Mathieu Dombrock 2023. GPL3 License.')
    .version(getPkgVer_js_1.default);
program
    .command('prompt', { isDefault: true })
    .description('send a prompt (default command)')
    .argument('<prompt...>', 'the prompt text')
    .option('-v, --verbose', 'verbose output')
    .option('-x, --max-tokens <number>', 'maximum tokens to use in response', '256')
    .option('-X, --unlimited', 'do not limit tokens used in reponse')
    .option('-t, --temperature <number>', 'temperature to use', '0.2')
    .option('-c, --context <string...>', 'context to prepend')
    .option('-d, --domain <string...>', 'subject domain to prepend')
    .option('-e, --expert <string...>', 'act as an expert on this domain')
    .option('-5, --like-im-five', 'explain it like I\'m 5 years old')
    .option('-H, --history <number>', 'prepend history (chatGPT mode)')
    .option('-f, --file <path>', 'preprend the given file contents')
    .option('-T, --trim', 'automatically trim the given file contents')
    .option('-m, --model <model-name>', 'specify the model name', 'gpt-3.5-turbo')
    .option('--mock', 'dont actually send the prompt to the API')
    .action((prompt, options) => {
    sllm.completion(prompt, options);
});
program
    .command('set')
    .description('set a persistant command option')
    .argument('<prompt...>', 'the prompt text')
    .option('-v, --verbose', 'verbose output')
    .option('-x, --max-tokens <number>', 'maximum tokens to use in response', '256')
    .option('-X, --no-limit', 'do not limit tokens used in reponse')
    .option('-t, --temperature <number>', 'temperature to use', '0.2')
    .option('-c, --context <string...>', 'context to prepend')
    .option('-d, --domain <string...>', 'subject domain to prepend')
    .option('-e, --expert <string...>', 'act as an expert on this domain')
    .option('-5, --like-im-five', 'explain it like I\'m 5 years old')
    .option('-H, --history <number>', 'prepend history (chatGPT mode)')
    .option('-f, --file <path>', 'preprend the given file contents')
    .option('-T, --trim', 'automatically trim the given file contents')
    .option('-m, --model <model-name>', 'specify the model name', 'gpt-3.5-turbo')
    .option('--mock', 'dont actually send the prompt to the API')
    .action((options) => {
    sllm.setOpts(options);
});
program
    .command('settings')
    .description('view the current settings that were changed via the `set` command')
    .option('-d, --delete', 'Delete the current settings')
    .action((options) => {
    sllm.settings(options);
});
program
    .command('hist')
    .description('manage the prompt / response history')
    .option('-v, --view <number>', 'view the conversation history')
    .option('-d, --delete', 'delete the conversation history')
    .option('-u, --undo <count>', 'remove the most recent entry from the history')
    .action((options) => {
    sllm.history(options);
});
program
    .command('alice bob')
    .description('manage the prompt / response history')
    .option('-v, --view <number>', 'view the conversation history')
    .option('-d, --delete', 'delete the conversation history')
    .option('-u, --undo <count>', 'remove the most recent entry from the history')
    .action((options) => {
    console.log('yee');
});
program
    .command('purge')
    .description('delete all history and settings')
    .action(() => {
    sllm.purge();
});
program
    .command('count')
    .description('estimate the tokens used by a prompt or file')
    .option('-p, --prompt <string...>', 'the prompt string to check')
    .option('-f, --file <path>', 'the file path to check')
    .option('-T, --trim', 'automatically trim the given file contents')
    .option('-m, --model <string>', 'specify the model name', 'gpt-3.5-turbo')
    .action((options) => {
    sllm.countTokens(options);
});
program
    .command('repeat')
    .description('repeat the last response')
    .action(() => {
    sllm.repeat();
});
program
    .command('models')
    .description('list the available models')
    .action(() => {
    sllm.listModels();
});
program.parse();
