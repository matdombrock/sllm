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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const readline_sync_1 = __importDefault(require("readline-sync"));
const child_process_1 = require("child_process");
const gpt_3_encoder_1 = require("gpt-3-encoder");
//import { Configuration, CreateChatCompletionRequest, OpenAIApi } from 'openai';
const openai_1 = __importDefault(require("openai"));
const models_js_1 = require("./models.js");
const TAG_USER = "_user_: ";
const TAG_ASSIST = "_assistant_: ";
;
;
;
class SLLM {
    constructor() {
        this.USER_CFG_DIR = os_1.default.homedir() + '/.config/sllm';
        this.MAX_HISTORY_STORE = 64;
        this.openaiCFGData = {
            apiKey: process.env.OPENAI_API_KEY,
        };
        this.assistAppendText = "";
        this.openai = new openai_1.default(this.openaiCFGData);
        // Ensure we have an api key env var
        this.ensureAPIKey();
        // Ensure we have our needed files
        this.ensureFiles();
    }
    /*
        Main Prompt Function
    */
    completion(promptArr, options) {
        return __awaiter(this, void 0, void 0, function* () {
            // Join prompt into single string
            let prompt = promptArr.join(' ');
            // Set static options
            options = this.loadOpts(options);
            // Ensure numbers
            options.maxTokens = Number(options.maxTokens) || 256;
            options.temperature = Number(options.temperature) || 0.2;
            options.history = Number(options.history) || 0;
            // Prepend a file if required
            if (options.file) {
                prompt = this.loadFile(prompt, options);
            }
            // Check model aliases
            if (models_js_1.modelAlias[options.model]) {
                options.model = models_js_1.modelAlias[options.model];
            }
            // Load models data
            const modelData = models_js_1.modelMap[options.model];
            if (!modelData) {
                throw 'Error: Unknown model: ' + options.model;
            }
            // Preprocess the prompt
            if (options.code) {
                prompt = this.preCodeOnly(prompt, options.code);
            }
            // Append History
            const ogPrompt = prompt; // Cache for history etc
            if (options.history) {
                prompt = this.loadHistory(options.history, false) + prompt; // Reversed
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
            // Apply verbose output
            if (options.verbose) {
                this.verbose(ogPrompt, options, encoded, totalTokens);
            }
            if (this.overTokenLimit(totalTokens, modelData, options)) {
                return;
            }
            // Make the request
            let output = 'WARNING: Did not send!';
            if (!options.mock) {
                console.log('Thinking...');
                if (modelData.api === 'gpt') {
                    output = yield this.sendReqGPT(prompt, options, modelData);
                }
                else if (modelData.api === 'davinci') {
                    output = yield this.sendReqDavinci(prompt, options, modelData);
                }
                else {
                    throw 'Error: Unknown API for model: ' + options.model;
                }
            }
            // Strip dialog references
            if (options.history) {
                output = output.replace(TAG_USER, '');
                output = output.replace(TAG_ASSIST, '');
            }
            // Check for empty response
            if (output.length < 1) {
                output = 'WARNING: Something went wrong! Try Again.';
            }
            // Trim whitespace
            output = output.trim();
            // Log output
            console.log(''); // This line intentionally left blank
            console.log(output);
            // Log history
            this.logHistory(ogPrompt, output);
        });
    }
    /*
        Command functions
    */
    historyView(options) {
        // Ensure number
        options.number = Number(options.view) || 32;
        const content = this.loadHistory(options.view, false);
        console.log(content);
        return;
    }
    historyPurge(options) {
        // Ensure number
        fs_1.default.rmSync(this.USER_CFG_DIR + '/history.json');
        console.log('Purged History');
        return;
    }
    historyUndo(options) {
        // Ensure number
        options.undo = Number(options.undo) || 1;
        let content = fs_1.default.readFileSync(this.USER_CFG_DIR + '/history.json', 'utf-8');
        if (!content) {
            console.log("WARNING: No history to undo!");
            return;
        }
        // History loaded in chronological order
        let historyJSON = JSON.parse(content) || [];
        const end = historyJSON.length - 1;
        historyJSON = historyJSON.slice(options.undo, end);
        fs_1.default.writeFileSync(this.USER_CFG_DIR + '/history.json', JSON.stringify(historyJSON, null, 2));
        console.log("History undone!");
    }
    repeat() {
        const last = this.loadHistory(1, true, true);
        console.log(last[0].llm);
    }
    settingsView() {
        let content = fs_1.default.readFileSync(this.USER_CFG_DIR + '/settings.json', 'utf-8');
        console.log(content);
        console.log('Settings can be changed with the `settings` command.');
    }
    settingsPurge() {
        fs_1.default.rmSync(this.USER_CFG_DIR + '/settings.json');
        console.log("Purged settings!");
    }
    settings(options) {
        console.log(JSON.stringify(options));
        fs_1.default.writeFileSync(this.USER_CFG_DIR + '/settings.json', JSON.stringify(options, null, 2));
        console.log('Created a new settings file');
    }
    purge() {
        fs_1.default.rmSync(this.USER_CFG_DIR + '/settings.json');
        fs_1.default.rmSync(this.USER_CFG_DIR + '/history.json');
        console.log('Purged!');
    }
    countTokens(options) {
        let tokens = 0;
        // Check model aliases
        if (models_js_1.modelAlias[options.model]) {
            options.model = models_js_1.modelAlias[options.model];
        }
        // Load models data
        const modelData = models_js_1.modelMap[options.model];
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
                fileContents = this.trim(fileContents);
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
    }
    listModels() {
        console.log('Available Models:');
        for (const [modelName, modelData] of Object.entries(models_js_1.modelMap)) {
            let alias = '';
            for (const [aliasName, aliasModelName] of Object.entries(models_js_1.modelAlias)) {
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
    }
    // List assistants
    assistList(options, quiet = false) {
        return __awaiter(this, void 0, void 0, function* () {
            const myAssistants = yield this.openai.beta.assistants.list({
                order: "desc",
                limit: "100",
            });
            if (!quiet) {
                if (options.full) {
                    console.log(myAssistants.data);
                }
                else {
                    for (const assistant of myAssistants.data) {
                        console.log(assistant.name);
                    }
                }
            }
            return myAssistants;
        });
    }
    // Delete assistant
    assistDelete(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const myAssistants = yield this.openai.beta.assistants.list({
                order: "desc",
                limit: "100",
            });
            let found = false;
            for (const assistant of myAssistants.data) {
                let shouldDelete = true;
                if (options.name) {
                    if (assistant.name != options.name)
                        shouldDelete = false;
                }
                if (options.id) {
                    if (assistant.id != options.id)
                        shouldDelete = false;
                }
                if (shouldDelete) {
                    found = true;
                    const response = yield this.openai.beta.assistants.del(assistant.id);
                    console.log(response);
                }
                if (!found) {
                    console.log("Could not find target assistant");
                }
            }
        });
    }
    assistLink(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const assistant = yield this.findAssistant(options.name);
            if (!assistant)
                return;
            const assistantFiles = yield this.openai.beta.assistants.files.list(assistant.id);
            for (const file of assistantFiles.data) {
                // Delete file
                const deletedAssistantFile = yield this.openai.beta.assistants.files.del(assistant.id, file.id);
                console.log("Deleted:");
                console.log(deletedAssistantFile);
            }
            const listing = fs_1.default.readdirSync(options.path);
            for (const fileName of listing) {
                const file = yield this.openai.files.create({
                    file: fs_1.default.createReadStream(options.path + "/" + fileName),
                    purpose: "assistants",
                });
                const myAssistantFile = yield this.openai.beta.assistants.files.create(assistant.id, {
                    file_id: file.id
                });
                console.log("Uploaded:");
                console.log(myAssistantFile);
            }
        });
    }
    // Upload and link a single file
    assistUpload(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const listing = fs_1.default.readdirSync(options.path);
            const assistant = yield this.findAssistant(options.name);
            if (!assistant)
                return;
            const file = yield this.openai.files.create({
                file: fs_1.default.createReadStream(options.path),
                purpose: "assistants",
            });
            const myAssistantFile = yield this.openai.beta.assistants.files.create(assistant.id, {
                file_id: file.id
            });
            console.log("Uploaded:");
            console.log(myAssistantFile);
        });
    }
    //
    assistInit(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const name = options.name || "assistant";
            let data = {
                name: name,
                instructions: 'You are a general purpose AI assistant.',
                tools: [""],
                filesPath: "",
                model: "gpt-4-1106-preview"
            };
            fs_1.default.writeFileSync(name + '.json', JSON.stringify(data, null, 2));
            console.log('Created ' + name + '.json assistant template');
            console.log('Load with .assist-create -f ' + name + '.json');
        });
    }
    // Create a new assistant
    assistCreate(options) {
        return __awaiter(this, void 0, void 0, function* () {
            let aData; // Assistant data
            if (options.file) { // Load custom
                const fileName = options.file;
                const file = fs_1.default.readFileSync(fileName, "utf-8");
                if (file) {
                    let fileJSON;
                    try {
                        fileJSON = JSON.parse(file);
                    }
                    catch (error) {
                        console.log("ERROR: Invalid assistant file (can't parse JSON): " + fileName);
                        return;
                    }
                    console.log(JSON.stringify(fileJSON, null, 2));
                    try {
                        aData = fileJSON;
                    }
                    catch (error) {
                        console.log("ERROR: Invalid assistant file (incorrect props): " + fileName);
                        return;
                    }
                }
                else {
                    console.log("ERROR: Can't open file " + fileName);
                    return;
                }
            }
            else { // Load generic
                console.log("Loading generic assistant...");
                const fileName = "generic.json";
                const file = fs_1.default.readFileSync(__dirname + "/../assistants/" + fileName, "utf-8");
                if (file) {
                    const fileJSON = JSON.parse(file);
                    console.log(JSON.stringify(fileJSON, null, 2));
                    aData = fileJSON;
                }
                else {
                    console.log("Can't open file " + fileName);
                    return;
                }
            }
            // Check for existing assistant with the same name
            const myAssistants = yield this.assistList({}, true);
            for (const existing of myAssistants.data) {
                if (existing.name == aData.name) {
                    console.log("ERROR: An assistant with this name already exists. Aborting.");
                    return;
                }
            }
            // Setup files
            const fileIds = [];
            if (aData.filesPath !== "null") {
                if (!fs_1.default.existsSync(aData.filesPath)) {
                    console.log("Can't read files path for this assistant");
                    console.log(aData.filesPath);
                    return;
                }
                const fileUploads = fs_1.default.readdirSync(aData.filesPath, "utf-8");
                for (const upFileName of fileUploads) {
                    console.log("Uploading file..." + upFileName);
                    const file = yield this.openai.files.create({
                        file: fs_1.default.createReadStream(aData.filesPath + "/" + upFileName),
                        purpose: "assistants",
                    });
                    console.log("id: " + file.id);
                    fileIds.push(file.id);
                }
            }
            // Now we create an assistant with the assist data
            const assistant = yield this.openai.beta.assistants.create({
                name: aData.name,
                instructions: aData.instructions,
                tools: [{ type: "code_interpreter" }, { type: "retrieval" }],
                file_ids: fileIds,
                model: "gpt-4-1106-preview"
            });
            console.log("ASSISTANT ID:");
            console.log(assistant.id);
        });
    }
    assist(options) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            // Assist mode
            console.log("ASSISTANT MODE (BETA)");
            const assistName = options.name || "assistant";
            const existing = yield this.findAssistant(assistName);
            const assistId = existing.id;
            if (!existing)
                return;
            console.log(JSON.stringify(existing, null, 2));
            const thread = yield this.openai.beta.threads.create();
            const delay = ms => new Promise(res => setTimeout(res, ms));
            while (true) {
                let prompt = readline_sync_1.default.question(">> ");
                if (prompt[0] === ".") { // We have a special command
                    const parsed = prompt.split(' ');
                    const cmd = parsed[0];
                    // Switch?
                    if (cmd === ".exit") {
                        console.log("Good bye!");
                        return;
                    }
                    else if (cmd === ".run") {
                        const sysCmd = parsed.slice(1).join(' ');
                        const res = yield (0, child_process_1.execSync)(sysCmd, { encoding: 'utf8' });
                        console.log(res);
                    }
                    else if (cmd === ".cd") {
                        const path = parsed[1];
                        if (!fs_1.default.existsSync(path)) {
                            console.log("ERROR: Can't find the path: " + path);
                            continue;
                        }
                        process.chdir(path);
                        const res = yield (0, child_process_1.execSync)('ls', { encoding: 'utf-8' });
                        console.log(res);
                    }
                    else if (cmd === ".link") {
                        if (parsed.length !== 2) {
                            console.log("ERROR: Malformed .link command! Missing path?");
                            continue;
                        }
                        const dir = parsed[1];
                        if (!fs_1.default.existsSync(dir)) {
                            console.log("ERROR: Can't find/access directory: " + dir);
                            continue;
                        }
                        yield this.assistLink({ name: assistName, path: dir });
                        console.log("Linked files in: " + dir);
                    }
                    else if (cmd === ".append") {
                        if (parsed.length !== 2) {
                            this.assistAppendText = "";
                            console.log("Removed any appended file. Nothing extra will be sent with the next message.");
                            continue;
                        }
                        this.assistAppend(parsed[1]);
                        console.log("The contents of the file at " + parsed[1] + " will be appended to your next message.");
                    }
                    else if (cmd === ".upload") {
                        console.log("UPLOAD");
                        if (parsed.length !== 2) {
                            console.log("ERROR: Malformed .upload command! Missing path?");
                            continue;
                        }
                        this.assistUpload({ name: assistName, path: parsed[1] });
                    }
                    else if (cmd === ".help") {
                        let msg = "SLLM ASSISTANT HELP: \r\n";
                        msg += ".exit | stop this program \r\n";
                        msg += ".run <system_command ...> | execute a system command \r\n";
                        msg += ".cd <path> | change the working directory \r\n";
                        msg += ".link <path> | link a new set of files to this assistant - deletes old files \r\n";
                        msg += ".append <path> | append target file contents to your next message - omit <path> to reset - does not upload file \r\n";
                        msg += ".upload <path> | upload target file to this assistant \r\n";
                        msg += ".help | show this help message \r\n";
                        console.log(msg);
                    }
                    else {
                        console.log("ERROR: Command not found: " + cmd);
                    }
                    continue;
                }
                // Check if we have file contents to append
                if (this.assistAppendText !== "") {
                    prompt += " This is the file contents: \r\n" + this.assistAppendText;
                    this.assistAppendText = "";
                }
                const message = yield this.openai.beta.threads.messages.create(thread.id, {
                    role: "user",
                    content: prompt
                });
                const run = yield this.openai.beta.threads.runs.create(thread.id, {
                    assistant_id: assistId,
                    //instructions: "Please address the user as "+userName+". The user has a premium account."
                });
                let completed = false;
                while (!completed) {
                    const runCheck = yield this.openai.beta.threads.runs.retrieve(thread.id, run.id);
                    console.log("Thinking (" + (runCheck === null || runCheck === void 0 ? void 0 : runCheck.status) + ") ...");
                    if ((runCheck === null || runCheck === void 0 ? void 0 : runCheck.status) == "completed")
                        completed = true;
                    else
                        yield delay(5000);
                }
                const messages = yield this.openai.beta.threads.messages.list(thread.id);
                // Output
                if ((_a = messages.body.data[0].content[0].text) === null || _a === void 0 ? void 0 : _a.value) {
                    console.log(messages.body.data[0].content[0].text.value);
                }
                else {
                    console.log('Error detecting message...');
                    console.log(JSON.stringify(messages, null, 2));
                }
            }
            return;
        });
    }
    // ASSISTANT HELPERS
    // Returns 0 on fail
    findAssistant(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const myAssistants = yield this.assistList({}, true);
            for (const existing of myAssistants.data) {
                if (existing.name == name) {
                    return existing;
                }
            }
            console.log("Can't find an assistant with name: " + name);
            return 0;
        });
    }
    // Returns 0 on fail
    assistAppend(path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!fs_1.default.existsSync(path)) {
                console.log("ERROR: Can't find file at path: " + path);
                return 0;
            }
            const content = fs_1.default.readFileSync(path, "utf-8");
            this.assistAppendText = content;
        });
    }
    deleteFile(options) {
        var _a, e_1, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            const list = yield this.openai.files.list();
            try {
                for (var _d = true, list_1 = __asyncValues(list), list_1_1; list_1_1 = yield list_1.next(), _a = list_1_1.done, !_a; _d = true) {
                    _c = list_1_1.value;
                    _d = false;
                    const file = _c;
                    console.log(file);
                    yield this.openai.files.del(file.id);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = list_1.return)) yield _b.call(list_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
        });
    }
    /*
    API Wrappers
    */
    // Wrapper for completion
    sendReqDavinci(prompt, options, modelData) {
        var _a, _b;
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
            const completion = yield this.openai.chat.completions.create(reqData)
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
            return ((_b = (_a = completion === null || completion === void 0 ? void 0 : completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || "No response";
        });
    }
    // Wrapper for chat completion
    sendReqGPT(prompt, options, modelData) {
        var _a, _b;
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
            const completion = yield this.openai.chat.completions.create(reqData)
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
            return ((_b = (_a = completion === null || completion === void 0 ? void 0 : completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || "No response";
        });
    }
    /*
    Prompt Pre-processing
    */
    preCodeOnly(prompt, lang) {
        return prompt + ' Respond ONLY with valid ' + lang + ' code that could be executed verbatim. Do not include an explanation outside of inline comments.';
    }
    /*
    Utility Functions
    */
    // Handle verbose logging
    verbose(ogPrompt, options, encoded, totalTokens) {
        console.log('>> ' + ogPrompt + ' <<');
        console.log(JSON.stringify(options, null, 2));
        console.log('Encoded Tokens: ' + encoded.length);
        console.log('Total Potential Tokens: ' + totalTokens);
        console.log('Sending Prompt...');
        console.log('-------\r\n');
    }
    // Load a file from th FS
    // Handle trim if specified
    loadFile(prompt, options) {
        let fileContents = '';
        const fileLoc = options.file;
        if (fs_1.default.existsSync(fileLoc)) {
            fileContents = fs_1.default.readFileSync(fileLoc, 'utf-8');
        }
        if (options.trim) {
            fileContents = this.trim(fileContents);
        }
        prompt = '```\r\n' +
            fileContents +
            '```\r\n' +
            prompt;
        return prompt;
    }
    // Check if we are over the token limit
    // Return true if we are over the token limit
    overTokenLimit(totalTokens, modelData, options) {
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
    ensureFiles() {
        if (!fs_1.default.existsSync(this.USER_CFG_DIR)) {
            // Create the dir
            fs_1.default.mkdirSync(this.USER_CFG_DIR);
        }
        if (!fs_1.default.existsSync(this.USER_CFG_DIR + '/history.json')) {
            // Create the file
            fs_1.default.writeFileSync(this.USER_CFG_DIR + '/history.json', '[]');
        }
        if (!fs_1.default.existsSync(this.USER_CFG_DIR + '/settings.json')) {
            // Create the file
            fs_1.default.writeFileSync(this.USER_CFG_DIR + '/settings.json', '{}');
        }
    }
    // Ensure we have the API key setup
    ensureAPIKey() {
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
    loadOpts(options) {
        const content = fs_1.default.readFileSync(this.USER_CFG_DIR + '/settings.json', 'utf-8');
        const optJSON = JSON.parse(content);
        const res = Object.assign(options, optJSON);
        return res;
    }
    // Record the chat history to the local log
    logHistory(ogPrompt, output) {
        const histNew = {
            user: ogPrompt,
            llm: output,
        };
        const historyJSON = this.loadHistory(this.MAX_HISTORY_STORE, false, true);
        historyJSON.push(histNew);
        fs_1.default.writeFileSync(this.USER_CFG_DIR + '/history.json', JSON.stringify(historyJSON, null, 2));
    }
    // Load history from the local log
    loadHistory(count = 1, reverse = true, json = false) {
        let content = fs_1.default.readFileSync(this.USER_CFG_DIR + '/history.json', 'utf-8');
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
            historyStr += TAG_USER + item.user;
            historyStr += '\r\n';
            historyStr += TAG_ASSIST + item.llm;
            historyStr += '\r\n';
        }
        return historyStr;
    }
    trim(str) {
        return str.replace((/  |\r\n|\n|\r/gm), "");
    }
}
;
exports.default = SLLM;
