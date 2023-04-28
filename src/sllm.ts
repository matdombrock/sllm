#! /usr/bin/env node

import fs from 'fs';
import os from 'os';
import { encode } from 'gpt-3-encoder';
import { Configuration, CreateChatCompletionRequest, OpenAIApi } from 'openai';

import { modelMap, modelAlias } from './modelMap.js';

const USER_CFG_DIR: string = os.homedir() + '/.config/sllm';

const MAX_HISTORY_STORE: number = 64;

// Ensure we have an api key env var
_ensureAPIKey();
// Ensure we have our needed files
_ensureFiles();

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);


class SLLM {
	/*
		Main Prompt Function
	*/
	completion: Function = async function (promptArr: Array<string>, options: any): Promise<void> {
		// Join prompt into single string
		let prompt: string = promptArr.join(' ');
	
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
		if(modelAlias[options.model]){
			options.model = modelAlias[options.model];
		}
		// Load models data
		const modelData = modelMap[options.model];
		if(!modelData){
			throw 'Error: Unknown model: '+options.model;
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
			prompt =_loadHistory(options.history, false) + prompt; // Revrsed
		}
	
		// Count total prompt tokens and append to the maxTokens value
		const encoded = encode(prompt);
		const tokenCount = encoded.length;
		if(options.unlimited){
			options.maxTokens = modelData.maxTokens - tokenCount - 96;
			if(options.verbose){
				console.log('Set maxTokens to: '+options.maxTokens);
			}
		}
		const totalTokens = options.maxTokens + tokenCount;
	
		// Apply verbos outout
		if (options.verbose) {
			_verbose(ogPrompt, options, encoded, totalTokens);
		}
	
		if(_overTokenLimit(totalTokens, modelData, options)){return;}
	
		// Make the request
		let output = 'WARNING: Did not send!';
		if (!options.mock) {		
			console.log('Thinking...');
			if(modelData.api === 'gpt'){
				output = await this._sendReqGPT(prompt, options, modelData);
			}
			else if(modelData.api === 'davinci'){
				output = await this._sendReqDavinci(prompt, options, modelData);
			}
			else{
				throw 'Error: Unknown API for model: '+options.model;
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
		console.log('');// This line intentionally left blank
		console.log(output);
	
		// Log history
		_logHistory(ogPrompt, output);
	}
	/*
		Command functions
	*/
	historyView: Function = function(options: any): void {
		// Ensure number
		options.number = Number(options.view) || 32;
		const content = _loadHistory(options.view, false);
		console.log(content);
		return;
	}
	historyPurge: Function = function(options: any): void {
		// Ensure number
		fs.rmSync(USER_CFG_DIR + '/history.json');
		console.log('Purged History');
		return;
	}
	historyUndo: Function = function(options: any): void {
		// Ensure number
		options.undo = Number(options.undo) || 1;
		let content: string = fs.readFileSync(USER_CFG_DIR + '/history.json', 'utf-8');
		if(!content){
			console.log("WARNING: No history to undo!");
			return;
		}
		// History loaded in chronological order
		let historyJSON: any = JSON.parse(content) || [];
		const end: number = historyJSON.length-1;
		historyJSON = historyJSON.slice(options.undo, end);
		fs.writeFileSync(USER_CFG_DIR + '/history.json', JSON.stringify(historyJSON, null, 2));
		console.log("History undone!");
	}
	repeat: Function = function (): void {
		const last = _loadHistory(1, true, true);
		console.log(last[0].llm);
	}
	settingsView: Function = function (): void {
		let content = fs.readFileSync(USER_CFG_DIR + '/settings.json', 'utf-8');
		console.log(content);
		console.log('Settings can be changed with the `settings` command.');
	}
	settingsPurge: Function = function(): void{
		fs.rmSync(USER_CFG_DIR + '/settings.json');
		console.log("Purged settings!");
	}
	settings: Function = function(options: any): void {
		console.log(JSON.stringify(options));
		fs.writeFileSync(
			USER_CFG_DIR + '/settings.json',
			JSON.stringify(options, null, 2)
		);
		console.log('Created a new settings file');
	}
	purge: Function = function(): void {
		fs.rmSync(USER_CFG_DIR + '/settings.json');
		fs.rmSync(USER_CFG_DIR + '/history.json');
		console.log('Purged!');
	}
	countTokens: Function = function(options: any): void {
		let tokens = 0;
		// Check model aliases
		if(modelAlias[options.model]){
			options.model = modelAlias[options.model];
		}
		// Load models data
		const modelData = modelMap[options.model];
		if(!modelData){
			throw 'Error: Unknown model: '+options.model;
		}
		if (options.prompt) {
			options.prompt = options.prompt.join(' ');
			const encoded = encode(options.prompt);
			tokens += encoded.length;
		}
		if (options.file) {
			let fileContents = fs.readFileSync(options.file, 'utf-8');
			if(options.trim){
				fileContents = _trim(fileContents);
			}
			const encoded = encode(fileContents);
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
	listModels: Function = function (): void{
		console.log('Available Models:');
		for(const [modelName, modelData] of Object.entries(modelMap)){
			let alias = '';
			for(const [aliasName, aliasModelName] of Object.entries(modelAlias)){
				if(aliasModelName === modelName){
					alias = aliasName;
				}
			}
			console.log('-------');
			console.log(modelName);
			if(alias){
				console.log('alias: '+alias);
			}
			if(modelData.beta){
				console.log('beta: might require special access!');
			}
		}
		console.log('///////');
		console.log('You can specify a model with the -m option');
		console.log('More info: https://platform.openai.com/docs/models/');
	}
	/*
	API Wrappers
	*/
	// Wrapper for completion
	_sendReqDavinci = async function (prompt: string, options:any, modelData:any): Promise<string>{
		const reqData = {
			model: modelData.model,
			prompt: prompt,
			max_tokens: options.maxTokens,
			temperature: options.temperature,
		};
		if(options.verbose){
			console.log(reqData);
			console.log('-------\r\n');
		}
		const completion = await openai.createCompletion(reqData)
		.catch((err)=>{
			if(options.verbose){
				console.log(err);
			}
			console.log('Error: Something went wrong!');
			if(modelData.beta){
				console.log('Note: '+modelData.model+' is a beta API which you might not have access to!');
			}
			process.exit();
		});
		return completion.data.choices[0].text || "No response!";
	}
	// Wrapper for chat completion
	_sendReqGPT: Function = async function (prompt:string, options:any, modelData:any): Promise<string>{
		// Use gpt3.5 by default
		const reqData: CreateChatCompletionRequest = {
			model: modelData.model,
			messages: [{ role: 'user', content: prompt }],
			max_tokens: options.maxTokens,
			temperature: options.temperature,
			stream: false,
		}
		if(options.verbose){
			console.log(reqData);
			console.log('-------\r\n');
		}
		const completion = await openai.createChatCompletion(reqData)
		.catch((err)=>{
			if(options.verbose){
				console.log(err);
			}
			console.log('Error: Something went wrong!');
			if(modelData.beta){
				console.log('Note: '+modelData.model+' is a beta model which you might not have access to!');
			}
			process.exit();
		});
		return completion?.data?.choices[0]?.message?.content || "No response";
	}
};

export default SLLM;

/*
	Prompt Pre-processing
*/
function _preLike5(prompt){
	return 'Answer this as if I\'m five years old: ' + prompt;
}
function _preContext(prompt, context){
	return 'In the context of ' + context.join(' ') + ', ' + prompt;
}
function _preDomain(prompt, domain){
	return 'In the domain of ' + domain.join(' ') + ', ' + prompt;
}
function _preExpert(prompt, expert){
	return 'Act as an expert on ' +
			expert.join(' ') +
			'. The question I need you to answer is: ' +
			prompt;
}

/*
	Utility Functions
*/
// Handle verbose logging
function _verbose(ogPrompt, options, encoded, totalTokens){
	console.log('>> ' + ogPrompt + ' <<');
	console.log(JSON.stringify(options, null, 2));
	console.log('Encoded Tokens: ' + encoded.length);
	console.log('Total Potential Tokens: ' + totalTokens);
	console.log('Sending Prompt...');
	console.log('-------\r\n');
}

// Load a file from th FS
// Handle trim if specified
function _loadFile(options){
	let fileContents = '';
	const fileLoc = options.file;
	if (fs.existsSync(fileLoc)) {
		fileContents = fs.readFileSync(fileLoc, 'utf-8');
	}
	if(options.trim){
		fileContents = _trim(fileContents);
	}
	let prompt ='```\r\n' +
	fileContents +
	'```\r\n' +
	options.prompt;
	return prompt;
}
function _trim(str){
	return str.replace((/  |\r\n|\n|\r/gm),"");
}

// Check if we are over the token limit
// Return true if we are over the token limit
function _overTokenLimit(totalTokens, modelData, options){
	if (options.maxTokens > modelData.maxTokens){
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
	if (!fs.existsSync(USER_CFG_DIR)) {
		// Create the dir
		fs.mkdirSync(USER_CFG_DIR);
	}
	if (!fs.existsSync(USER_CFG_DIR + '/history.json')) {
		// Create the file
		fs.writeFileSync(USER_CFG_DIR + '/history.json', '[]');
	}
	if (!fs.existsSync(USER_CFG_DIR + '/settings.json')) {
		// Create the file
		fs.writeFileSync(USER_CFG_DIR + '/settings.json', '{}');
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
	const content = fs.readFileSync(USER_CFG_DIR + '/settings.json', 'utf-8');
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
	fs.writeFileSync(
		USER_CFG_DIR + '/history.json',
		JSON.stringify(historyJSON, null, 2)
	);
}

// Load history from the local log
function _loadHistory(count = 1, reverse = true, json = false) {
	let content = fs.readFileSync(USER_CFG_DIR + '/history.json', 'utf-8');
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


