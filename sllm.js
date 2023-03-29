#! /usr/bin/env node

const fs = require('fs');
const os = require('os');
const { encode } = require('gpt-3-encoder');
const { Configuration, OpenAIApi } = require('openai');
const { Command } = require('commander'); // (normal include)

const USER_CFG_DIR = os.homedir() + '/.config/sllm';

const MAX_HISTORY_STORE = 64;

// Read package.json version number
const VERSION_NUMBER = JSON.parse(
	fs.readFileSync(__dirname + '/package.json')
).version;

// Ensure we have an api key env var
_ensureAPIKey();
// Ensure we have our needed files
_ensureFiles();

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const modelMap = {
	'text-davinci-2':{
		api: 'davinci',
		maxTokens: 4097,
		beta: false
	},
	'text-davinci-3':{
		api: 'davinci',
		maxTokens: 4097,
		beta: false
	},
	'code-davinci-002':{
		api: 'davinci',
		maxTokens: 8001,
		beta: true
	},
	'gpt-3.5-turbo':{
		api: 'gpt',
		maxTokens: 4096,
		beta: false
	},
	'gpt-4':{
		api: 'gpt',
		maxTokens: 8192,
		beta: true
	}
};

/*
	Main Prompt Function
*/
async function llm(prompt, options) {
	// Join prompt into single string
	prompt = prompt.join(' ');

	// Set static options
	options = _loadOpts(options);

	// Ensure numbers
	options.maxTokens = Number(options.maxTokens) || 256;
	options.temperature = Number(options.temperature) || 0.2;
	options.history = Number(options.history) || 0;

	// Prepend a file if required
	if (options.file) {
	    prompt = _loadFile(options.file);
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
	const totalTokens = options.maxTokens + tokenCount;

	// Apply verbos outout
	if (options.verbose) {
		_verbose(ogPrompt, options, encoded, totalTokens);
	}

	if(_overTokenLimit(totalTokens, modelData)){return;}

	// Make the request
	let output = 'WARNING: Did not send!';
	if (!options.mock) {		
		if(modelData.api === 'gpt'){
			output = await _sendReqGPT(prompt, options, modelData);
		}
		else if(modelData.api === 'davinci'){
			output = await _sendReqDavinci(prompt, options, modelData);
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
function history(options) {
	if (options.delete) {
		fs.rmSync(USER_CFG_DIR + '/history.json');
		console.log('Deleted History');
		return;
	}
	// Default to view
	if (options.view) {
		// Ensure number
		options.view = Number(options.view) || 32;
		const content = _loadHistory(options.view, false);
		console.log(content);
		return;
	}
}

function repeat() {
	const last = _loadHistory(1, true, true);
	console.log(last[0].llm);
}

function settings(options) {
	let content;
	if (options.delete) {
		fs.rmSync(USER_CFG_DIR + '/settings.json');
		content = 'Deleted Settings';
	} else {
		content = fs.readFileSync(USER_CFG_DIR + '/settings.json', 'UTF-8');
	}
	console.log(content);
	console.log('Settings can be changed with the `set` command.');
}

function setOpts(options) {
	console.log(JSON.stringify(options));
	fs.writeFileSync(
		USER_CFG_DIR + '/settings.json',
		JSON.stringify(options, null, 2)
	);
	console.log('Created a new settings file');
}

function purge() {
	fs.rmSync(USER_CFG_DIR + '/settings.json');
	fs.rmSync(USER_CFG_DIR + '/history.json');
	console.log('Purged!');
}

function countTokens(options) {
	let tokens = 0;
	if (options.prompt) {
		options.prompt = options.prompt.join(' ');
		const encoded = encode(options.prompt);
		tokens += encoded.length;
	}
	if (options.file) {
		let fileContents = fs.readFileSync(options.file, 'UTF-8');
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

	console.log('Estimated Tokens: ' + tokens + '/' + '4096');
	console.log('Max Reply: ' + (4096 - tokens));
}
/*
	API Wrappers
*/
// Wrapper for completion
async function _sendReqDavinci(prompt, options, modelData){
	const reqData = {
		model: options.model,
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
		console.log(err);
		console.log('Error: Something went wrong!');
		if(modelData.beta){
			console.log('This is a beta API which you might not have access to!');
		}
		process.exit();
	});
	return completion.data.choices[0].text;
}
// Wrapper for chat completion
async function _sendReqGPT(prompt, options, modelData){
	// Use gpt3.5 by default
	const reqData = {
		model: options.model,
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
		console.log(err);
		console.log('Error: Something went wrong!');
		if(modelData.beta){
			console.log('This is a beta API which you might not have access to!');
		}
		process.exit();
	});
	return completion.data.choices[0].message.content;
}
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
function _loadFile(fileLoc){
	let fileContents = '';
	if (fs.existsSync(fileLoc)) {
		fileContents = fs.readFileSync(fileLoc, 'UTF-8');
	}
	if(options.trim){
		fileContents = _trim(fileContents);
	}
	prompt ='```\r\n' +
	fileContents +
	'```\r\n' +
	prompt;
	return prompt;
}
function _trim(str){
	return str.replace((/  |\r\n|\n|\r/gm),"");
}

// Check if we are over the token limit
// Return true if we are over the token limit
function _overTokenLimit(totalTokens, modelData){
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
	const content = fs.readFileSync(USER_CFG_DIR + '/settings.json', 'UTF-8');
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
	let content = fs.readFileSync(USER_CFG_DIR + '/history.json', 'UTF-8');
	if (!content) {
		console.log('WARNING: Can not read history file!');
		content = '[]';
	}
	let historyJSON = JSON.parse(content) || [];
	// Always reverse history first
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

/*
	Commander Setup
*/

const program = new Command();

program
	.name('sllm')
	.description(
		'CLI for OpenAI Large Language Models. v'+VERSION_NUMBER+'. \r\nCreated by Mathieu Dombrock 2023. GPL3 License.'
	)
	.version(VERSION_NUMBER);

program
	.command('prompt', { isDefault: true })
	.description('send a prompt (default command)')
	.argument('<prompt...>', 'the prompt text')
	.option('-v, --verbose', 'verbose output')
	.option('-x, --max-tokens <number>', 'maximum tokens to use', '256')
	.option('-t, --temperature <number>', 'temperature to use', '0.2')
	.option('-c, --context <string...>', 'context to prepend')
	.option('-d, --domain <string...>', 'subject domain to prepend')
	.option('-e, --expert <string...>', 'act as an expert on this domain')
	.option('-5, --like-im-five', 'explain it like I\'m 5 years old')
	.option('-H, --history <number>', 'prepend history (chatGPT mode)')
	.option('-f, --file <path>', 'preprend the given file contents')
	.option('-T, --trim', 'automatically trim the given file contents')
	.option('-m, --model <string>', 'specify the model name', 'gpt-3.5-turbo')
	.option('--gpt3.5t', 'use text-davinci-3.5 turbo mode')
	.option('--gpt3', 'use text-davinci-3 mode')
	.option('--mock', 'dont actually send the prompt to the API')
	.action((prompt, options) => {
		llm(prompt, options);
	});

program
	.command('set')
	.description('set a persistant command option')
	.option('-v, --verbose', 'verbose output')
	.option('-x, --max-tokens <number>', 'maximum tokens to use', '256')
	.option('-t, --temperature <number>', 'temperature to use', '0.2')
	.option('-c, --context <string...>', 'context to prepend')
	.option('-d, --domain <string...>', 'subject domain to prepend')
	.option('-e, --expert <string...>', 'act as an expert on this domain')
	.option('-5, --like-im-five', 'explain it like I\'m 5 years old')
	.option('-H, --history <number>', 'prepend history (chatGPT mode)')
	.option('-f, --file <path>', 'preprend the given file contents')
	.option('-T, --trim', 'automatically trim the given file contents')
	.option('-3, --gpt3', 'use text-davinci-3 mode')
	.option('--mock', 'dont actually send the prompt to the API')
	.action((options) => {
		setOpts(options);
	});

program
	.command('settings')
	.description(
		'view the current settings that were changed via the `set` command'
	)
	.option('-d, --delete', 'Delete the current settings')
	.action((options) => {
		settings(options);
	});

program
	.command('hist')
	.description('manage the prompt / response history')
	.option('-v, --view <number>', 'view the prompt history', '8')
	.option('-d, --delete', 'delete the prompt history')
	.action((options) => {
		history(options);
	});

program
	.command('purge')
	.description('delete all history and settings')
	.action(() => {
		purge();
	});

program
	.command('count')
	.description('estimate the tokens used by a prompt or file')
	.option('-p, --prompt <string...>', 'the prompt string to check')
	.option('-f, --file <path>', 'the file path to check')
	.option('-T, --trim', 'automatically trim the given file contents')
	.action((options) => {
		countTokens(options);
	});

program
	.command('repeat')
	.description('repeat the last response')
	.action(() => {
		repeat();
	});

program.parse();
