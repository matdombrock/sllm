#! /usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const gpt_3_encoder_1 = require("gpt-3-encoder");
const openai_1 = require("openai");
const modelMap_js_1 = require("./modelMap.js");
const USER_CFG_DIR = os_1.default.homedir() + '/.config/sllm';
const MAX_HISTORY_STORE = 64;
// Ensure we have an api key env var
_ensureAPIKey();
// Ensure we have our needed files
_ensureFiles();
const configuration = new openai_1.Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new openai_1.OpenAIApi(configuration);
class SLLM {
    constructor() {
        /*
            Main Prompt Function
        */
        this.completion = function (promptArr, options) {
            return __awaiter(this, void 0, void 0, function* () {
                // Join prompt into single string
                let prompt = promptArr.join(' ');
                // Set static options
                options = _loadOpts(options);
                // Ensure numbers
                options.maxTokens = Number(options.maxTokens) || 256;
                options.temperature = Number(options.temperature) || 0.2;
                options.history = Number(options.history) || 0;
                // Prepend a file if required
                if (options.file) {
                    prompt = _loadFile(options);
                }
                // Check model aliases
                if (modelMap_js_1.modelAlias[options.model]) {
                    options.model = modelMap_js_1.modelAlias[options.model];
                }
                // Load models data
                const modelData = modelMap_js_1.modelMap[options.model];
                if (!modelData) {
                    throw 'Error: Unknown model: ' + options.model;
                }
                // Preproceess the prompt
                if (options.likeImFive) {
                    prompt = _preLike5(prompt);
                }
                if (options.context) {
                    prompt = _preContext(prompt, options.context);
                }
                if (options.domain) {
                    prompt = _preDomain(prompt, options.domain);
                }
                if (options.expert) {
                    prompt = _preExpert(prompt, options.expert);
                }
                // Append History
                const ogPrompt = prompt; // Cache for history etc
                if (options.history) {
                    prompt = _loadHistory(options.history, false) + prompt; // Revrsed
                }
                // Count total prompt tokens and append to the maxTokens value
                const encoded = (0, gpt_3_encoder_1.encode)(prompt);
                const tokenCount = encoded.length;
                if (options.unlimited) {
                    options.maxTokens = modelData.maxTokens - tokenCount - 96;
                    if (options.verbose) {
                        console.log('Set maxTokens to: ' + options.maxTokens);
                    }
                }
                const totalTokens = options.maxTokens + tokenCount;
                // Apply verbos outout
                if (options.verbose) {
                    _verbose(ogPrompt, options, encoded, totalTokens);
                }
                if (_overTokenLimit(totalTokens, modelData, options)) {
                    return;
                }
                // Make the request
                let output = 'WARNING: Did not send!';
                if (!options.mock) {
                    console.log('Thinking...');
                    if (modelData.api === 'gpt') {
                        output = yield this._sendReqGPT(prompt, options, modelData);
                    }
                    else if (modelData.api === 'davinci') {
                        output = yield this._sendReqDavinci(prompt, options, modelData);
                    }
                    else {
                        throw 'Error: Unknown API for model: ' + options.model;
                    }
                }
                // Strip dialog references
                if (options.history) {
                    output = output.replace('_user_:', '');
                    output = output.replace('_llm_:', '');
                }
                // Check for empty response
                if (output.length < 1) {
                    output = 'WARNING: Something went wrong! Try Again.';
                }
                // Trim whitesapce
                output = output.trim();
                // Log output
                console.log(''); // This line intentionally left blank
                console.log(output);
                // Log history
                _logHistory(ogPrompt, output);
            });
        };
        /*
            Command functions
        */
        this.historyView = function (options) {
            // Ensure number
            options.number = Number(options.view) || 32;
            const content = _loadHistory(options.view, false);
            console.log(content);
            return;
        };
        this.historyPurge = function (options) {
            // Ensure number
            fs_1.default.rmSync(USER_CFG_DIR + '/history.json');
            console.log('Purged History');
            return;
        };
        this.historyUndo = function (options) {
            // Ensure number
            options.undo = Number(options.undo) || 1;
            let content = fs_1.default.readFileSync(USER_CFG_DIR + '/history.json', 'utf-8');
            if (!content) {
                console.log("WARNING: No history to undo!");
                return;
            }
            // History loaded in chronological order
            let historyJSON = JSON.parse(content) || [];
            const end = historyJSON.length - 1;
            historyJSON = historyJSON.slice(options.undo, end);
            fs_1.default.writeFileSync(USER_CFG_DIR + '/history.json', JSON.stringify(historyJSON, null, 2));
            console.log("History undone!");
        };
        this.repeat = function () {
            const last = _loadHistory(1, true, true);
            console.log(last[0].llm);
        };
        this.settingsView = function () {
            let content = fs_1.default.readFileSync(USER_CFG_DIR + '/settings.json', 'utf-8');
            console.log(content);
            console.log('Settings can be changed with the `settings` command.');
        };
        this.settingsPurge = function () {
            fs_1.default.rmSync(USER_CFG_DIR + '/settings.json');
            console.log("Purged settings!");
        };
        this.settings = function (options) {
            console.log(JSON.stringify(options));
            fs_1.default.writeFileSync(USER_CFG_DIR + '/settings.json', JSON.stringify(options, null, 2));
            console.log('Created a new settings file');
        };
        this.purge = function () {
            fs_1.default.rmSync(USER_CFG_DIR + '/settings.json');
            fs_1.default.rmSync(USER_CFG_DIR + '/history.json');
            console.log('Purged!');
        };
        this.countTokens = function (options) {
            let tokens = 0;
            // Check model aliases
            if (modelMap_js_1.modelAlias[options.model]) {
                options.model = modelMap_js_1.modelAlias[options.model];
            }
            // Load models data
            const modelData = modelMap_js_1.modelMap[options.model];
            if (!modelData) {
                throw 'Error: Unknown model: ' + options.model;
            }
            if (options.prompt) {
                options.prompt = options.prompt.join(' ');
                const encoded = (0, gpt_3_encoder_1.encode)(options.prompt);
                tokens += encoded.length;
            }
            if (options.file) {
                let fileContents = fs_1.default.readFileSync(options.file, 'utf-8');
                if (options.trim) {
                    fileContents = _trim(fileContents);
                }
                const encoded = (0, gpt_3_encoder_1.encode)(fileContents);
                tokens += encoded.length;
            }
            if (tokens === 0) {
                console.log('ERROR: Nothing to count');
                console.log('Use the --prompt or --file options!');
                return;
            }
            const maxTokens = modelData.maxTokens;
            console.log('Estimated Tokens: ' + tokens + '/' + maxTokens);
            console.log('Max Reply: ' + (maxTokens - tokens));
        };
        this.listModels = function () {
            console.log('Available Models:');
            for (const [modelName, modelData] of Object.entries(modelMap_js_1.modelMap)) {
                let alias = '';
                for (const [aliasName, aliasModelName] of Object.entries(modelMap_js_1.modelAlias)) {
                    if (aliasModelName === modelName) {
                        alias = aliasName;
                    }
                }
                console.log('-------');
                console.log(modelName);
                if (alias) {
                    console.log('alias: ' + alias);
                }
                if (modelData.beta) {
                    console.log('beta: might require special access!');
                }
            }
            console.log('///////');
            console.log('You can specify a model with the -m option');
            console.log('More info: https://platform.openai.com/docs/models/');
        };
        /*
        API Wrappers
        */
        // Wrapper for completion
        this._sendReqDavinci = function (prompt, options, modelData) {
            return __awaiter(this, void 0, void 0, function* () {
                const reqData = {
                    model: modelData.model,
                    prompt: prompt,
                    max_tokens: options.maxTokens,
                    temperature: options.temperature,
                };
                if (options.verbose) {
                    console.log(reqData);
                    console.log('-------\r\n');
                }
                const completion = yield openai.createCompletion(reqData)
                    .catch((err) => {
                    if (options.verbose) {
                        console.log(err);
                    }
                    console.log('Error: Something went wrong!');
                    if (modelData.beta) {
                        console.log('Note: ' + modelData.model + ' is a beta API which you might not have access to!');
                    }
                    process.exit();
                });
                return completion.data.choices[0].text || "No response!";
            });
        };
        // Wrapper for chat completion
        this._sendReqGPT = function (prompt, options, modelData) {
            var _a, _b, _c;
            return __awaiter(this, void 0, void 0, function* () {
                // Use gpt3.5 by default
                const reqData = {
                    model: modelData.model,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: options.maxTokens,
                    temperature: options.temperature,
                    stream: false,
                };
                if (options.verbose) {
                    console.log(reqData);
                    console.log('-------\r\n');
                }
                const completion = yield openai.createChatCompletion(reqData)
                    .catch((err) => {
                    if (options.verbose) {
                        console.log(err);
                    }
                    console.log('Error: Something went wrong!');
                    if (modelData.beta) {
                        console.log('Note: ' + modelData.model + ' is a beta model which you might not have access to!');
                    }
                    process.exit();
                });
                return ((_c = (_b = (_a = completion === null || completion === void 0 ? void 0 : completion.data) === null || _a === void 0 ? void 0 : _a.choices[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || "No response";
            });
        };
    }
}
;
exports.default = SLLM;
/*
    Prompt Pre-processing
*/
function _preLike5(prompt) {
    return 'Answer this as if I\'m five years old: ' + prompt;
}
function _preContext(prompt, context) {
    return 'In the context of ' + context.join(' ') + ', ' + prompt;
}
function _preDomain(prompt, domain) {
    return 'In the domain of ' + domain.join(' ') + ', ' + prompt;
}
function _preExpert(prompt, expert) {
    return 'Act as an expert on ' +
        expert.join(' ') +
        '. The question I need you to answer is: ' +
        prompt;
}
/*
    Utility Functions
*/
// Handle verbose logging
function _verbose(ogPrompt, options, encoded, totalTokens) {
    console.log('>> ' + ogPrompt + ' <<');
    console.log(JSON.stringify(options, null, 2));
    console.log('Encoded Tokens: ' + encoded.length);
    console.log('Total Potential Tokens: ' + totalTokens);
    console.log('Sending Prompt...');
    console.log('-------\r\n');
}
// Load a file from th FS
// Handle trim if specified
function _loadFile(options) {
    let fileContents = '';
    const fileLoc = options.file;
    if (fs_1.default.existsSync(fileLoc)) {
        fileContents = fs_1.default.readFileSync(fileLoc, 'utf-8');
    }
    if (options.trim) {
        fileContents = _trim(fileContents);
    }
    let prompt = '```\r\n' +
        fileContents +
        '```\r\n' +
        options.prompt;
    return prompt;
}
function _trim(str) {
    return str.replace((/  |\r\n|\n|\r/gm), "");
}
// Check if we are over the token limit
// Return true if we are over the token limit
function _overTokenLimit(totalTokens, modelData, options) {
    if (options.maxTokens > modelData.maxTokens) {
        console.log(`ERROR: You requested ${options.maxTokens} which exceeds the model limit of ${modelData.maxTokens}`);
        return true;
    }
    if (totalTokens > modelData.maxTokens - 96) {
        console.log('ERROR: Max Tokens Exceeded ' + '(' + totalTokens + ')');
        console.log('Please limit your prompt');
        if (options.history) {
            console.log('Trying running with history off!');
        }
        return true;
    }
    return false;
}
// Ensure we have the needed files 
// Create them if we have to
function _ensureFiles() {
    if (!fs_1.default.existsSync(USER_CFG_DIR)) {
        // Create the dir
        fs_1.default.mkdirSync(USER_CFG_DIR);
    }
    if (!fs_1.default.existsSync(USER_CFG_DIR + '/history.json')) {
        // Create the file
        fs_1.default.writeFileSync(USER_CFG_DIR + '/history.json', '[]');
    }
    if (!fs_1.default.existsSync(USER_CFG_DIR + '/settings.json')) {
        // Create the file
        fs_1.default.writeFileSync(USER_CFG_DIR + '/settings.json', '{}');
    }
}
// Ensure we have the API key setup
function _ensureAPIKey() {
    if (!process.env.OPENAI_API_KEY) {
        let err = 'ERROR: OPENAI_API_KEY unset\r\n';
        err += 'To set, use the command:\r\n';
        err += 'export OPENAI_API_KEY=<your_key>\r\n';
        err += 'https://platform.openai.com/account/api-keys';
        console.log(err);
        process.exit();
    }
}
// Overwrite the CLI options with those saved in the file
function _loadOpts(options) {
    const content = fs_1.default.readFileSync(USER_CFG_DIR + '/settings.json', 'utf-8');
    const optJSON = JSON.parse(content);
    options = Object.assign(optJSON, options);
    return options;
}
// Record the chat history to the local log
function _logHistory(ogPrompt, output) {
    const histNew = {
        user: ogPrompt,
        llm: output,
    };
    const historyJSON = _loadHistory(MAX_HISTORY_STORE, false, true);
    historyJSON.push(histNew);
    fs_1.default.writeFileSync(USER_CFG_DIR + '/history.json', JSON.stringify(historyJSON, null, 2));
}
// Load history from the local log
function _loadHistory(count = 1, reverse = true, json = false) {
    let content = fs_1.default.readFileSync(USER_CFG_DIR + '/history.json', 'utf-8');
    if (!content) {
        console.log('WARNING: Can not read history file!');
        content = '[]';
    }
    let historyJSON = JSON.parse(content) || [];
    // Always reverse history first
    // Reverse chronological
    historyJSON.reverse();
    // Slice the history
    historyJSON = historyJSON.slice(0, count);
    // Undo reverse if needed
    if (reverse === false) {
        historyJSON.reverse();
    }
    if (json) {
        // Return json
        return historyJSON;
    }
    let historyStr = '';
    for (const item of historyJSON) {
        historyStr += '_user_: ' + item.user;
        historyStr += '\r\n';
        historyStr += '_llm_: ' + item.llm;
        historyStr += '\r\n';
    }
    return historyStr;
}
