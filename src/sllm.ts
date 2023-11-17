#! /usr/bin/env node

import fs from 'fs';
import os from 'os';
import { encode } from 'gpt-3-encoder';
import { Configuration, CreateChatCompletionRequest, OpenAIApi } from 'openai';

import { modelMap, modelAlias, ModelInfo } from './models.js';

class SLLM {
	private USER_CFG_DIR: string = os.homedir() + '/.config/sllm';
	private MAX_HISTORY_STORE: number = 64;
	private openai;
	private configuration = new Configuration({
		apiKey: process.env.OPENAI_API_KEY,
	});
	constructor(){
		this.openai = new OpenAIApi(this.configuration)
		// Ensure we have an api key env var
		this.ensureAPIKey();
		// Ensure we have our needed files
		this.ensureFiles();
	}
	/*
		Main Prompt Function
	*/
	public async completion(promptArr: Array<string>, options: any): Promise<void> {
		// Join prompt into single string
		let prompt: string = promptArr.join(' ');
	
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
		if(modelAlias[options.model]){
			options.model = modelAlias[options.model];
		}
		// Load models data
		const modelData = modelMap[options.model];
		if(!modelData){
			throw 'Error: Unknown model: '+options.model;
		}
		// Preprocess the prompt
		if (options.code) {
			prompt = this.preCodeOnly(prompt, options.code);
		}
	
		// Append History
		const ogPrompt = prompt; // Cache for history etc
		if (options.history) {
			prompt =this.loadHistory(options.history, false) + prompt; // Reversed
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
	
		// Apply verbose output
		if (options.verbose) {
			this.verbose(ogPrompt, options, encoded, totalTokens);
		}
	
		if(this.overTokenLimit(totalTokens, modelData, options)){return;}
	
		// Make the request
		let output = 'WARNING: Did not send!';
		if (!options.mock) {		
			console.log('Thinking...');
			if(modelData.api === 'gpt'){
				output = await this.sendReqGPT(prompt, options, modelData);
			}
			else if(modelData.api === 'davinci'){
				output = await this.sendReqDavinci(prompt, options, modelData);
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
	
		// Trim whitespace
		output = output.trim();
		// Log output
		console.log('');// This line intentionally left blank
		console.log(output);
	
		// Log history
		this.logHistory(ogPrompt, output);
	}
	/*
		Command functions
	*/
	public historyView(options: any): void {
		// Ensure number
		options.number = Number(options.view) || 32;
		const content = this.loadHistory(options.view, false);
		console.log(content);
		return;
	}
	public historyPurge(options: any): void {
		// Ensure number
		fs.rmSync(this.USER_CFG_DIR + '/history.json');
		console.log('Purged History');
		return;
	}
	public historyUndo(options: any): void {
		// Ensure number
		options.undo = Number(options.undo) || 1;
		let content: string = fs.readFileSync(this.USER_CFG_DIR + '/history.json', 'utf-8');
		if(!content){
			console.log("WARNING: No history to undo!");
			return;
		}
		// History loaded in chronological order
		let historyJSON: any = JSON.parse(content) || [];
		const end: number = historyJSON.length-1;
		historyJSON = historyJSON.slice(options.undo, end);
		fs.writeFileSync(this.USER_CFG_DIR + '/history.json', JSON.stringify(historyJSON, null, 2));
		console.log("History undone!");
	}
	public repeat(): void {
		const last = this.loadHistory(1, true, true);
		console.log(last[0].llm);
	}
	public settingsView(): void {
		let content = fs.readFileSync(this.USER_CFG_DIR + '/settings.json', 'utf-8');
		console.log(content);
		console.log('Settings can be changed with the `settings` command.');
	}
	public settingsPurge(): void{
		fs.rmSync(this.USER_CFG_DIR + '/settings.json');
		console.log("Purged settings!");
	}
	public settings(options: any): void {
		console.log(JSON.stringify(options));
		fs.writeFileSync(
			this.USER_CFG_DIR + '/settings.json',
			JSON.stringify(options, null, 2)
		);
		console.log('Created a new settings file');
	}
	public purge(): void {
		fs.rmSync(this.USER_CFG_DIR + '/settings.json');
		fs.rmSync(this.USER_CFG_DIR + '/history.json');
		console.log('Purged!');
	}
	public countTokens(options: any): void {
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
				fileContents = this.trim(fileContents);
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
	public listModels(): void{
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
	private async sendReqDavinci(prompt: string, options:any, modelData:any): Promise<string>{
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
		const completion = await this.openai.createCompletion(reqData)
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
	private async sendReqGPT(prompt:string, options:any, modelData:any): Promise<string>{
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
		const completion = await this.openai.createChatCompletion(reqData)
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
	/*
	Prompt Pre-processing
	*/
	private preCodeOnly(prompt:string, lang:string){
		return prompt + ' Respond ONLY with valid '+lang+' code that could be executed verbatim. Do not include an explanation outside of inline comments.';
	}
	/*
	Utility Functions
	*/
	// Handle verbose logging
	private verbose(ogPrompt:string, options:any, encoded:Array<number>, totalTokens:number):void{
		console.log('>> ' + ogPrompt + ' <<');
		console.log(JSON.stringify(options, null, 2));
		console.log('Encoded Tokens: ' + encoded.length);
		console.log('Total Potential Tokens: ' + totalTokens);
		console.log('Sending Prompt...');
		console.log('-------\r\n');
	}
	// Load a file from th FS
	// Handle trim if specified
	private loadFile(prompt:string, options):string{
		let fileContents = '';
		const fileLoc = options.file;
		if (fs.existsSync(fileLoc)) {
			fileContents = fs.readFileSync(fileLoc, 'utf-8');
		}
		if(options.trim){
			fileContents = this.trim(fileContents);
		}
		prompt ='```\r\n' +
		fileContents +
		'```\r\n' +
		prompt;
		return prompt;
	}
	// Check if we are over the token limit
	// Return true if we are over the token limit
	private overTokenLimit(totalTokens:number, modelData:ModelInfo, options):boolean{
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
	private ensureFiles() {
		if (!fs.existsSync(this.USER_CFG_DIR)) {
			// Create the dir
			fs.mkdirSync(this.USER_CFG_DIR);
		}
		if (!fs.existsSync(this.USER_CFG_DIR + '/history.json')) {
			// Create the file
			fs.writeFileSync(this.USER_CFG_DIR + '/history.json', '[]');
		}
		if (!fs.existsSync(this.USER_CFG_DIR + '/settings.json')) {
			// Create the file
			fs.writeFileSync(this.USER_CFG_DIR + '/settings.json', '{}');
		}
	}
	// Ensure we have the API key setup
	private ensureAPIKey():void {
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
	private loadOpts(options:any):any {
		const content = fs.readFileSync(this.USER_CFG_DIR + '/settings.json', 'utf-8');
		const optJSON = JSON.parse(content);
		const res = Object.assign(options, optJSON);
		return res;
	}
	// Record the chat history to the local log
	private logHistory(ogPrompt:string, output:string):void {
		const histNew = {
			user: ogPrompt,
			llm: output,
		};
		const historyJSON = this.loadHistory(this.MAX_HISTORY_STORE, false, true);
		historyJSON.push(histNew);
		fs.writeFileSync(
			this.USER_CFG_DIR + '/history.json',
			JSON.stringify(historyJSON, null, 2)
		);
	}
	// Load history from the local log
	private loadHistory(count:number = 1, reverse:boolean = true, json:boolean = false):any {// Really json or string
		let content = fs.readFileSync(this.USER_CFG_DIR + '/history.json', 'utf-8');
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

	private trim(str:string):string{
		return str.replace((/  |\r\n|\n|\r/gm),"");
	}
	
};

export default SLLM;
