#! /usr/bin/env node
const fs = require('fs');

const { encode, decode } = require('gpt-3-encoder');

const { Configuration, OpenAIApi } = require("openai");

const { Command } = require('commander'); // (normal include)


const MAX_HISTORY_STORE = 64;

// Ensure we have an api key env var
if(!process.env.OPENAI_API_KEY){
    let err = 'ERROR: OPENAI_API_KEY unset\r\n';
    err += 'To set, use the command:\r\n'; 
    err += 'export OPEN_API_KEY=<your_key>\r\n';
    err += 'https://platform.openai.com/account/api-keys';
    console.log(err);
    process.exit();
}
// Ensure we have our needed files
_ensureFiles();

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

async function run(prompt, options){
	// Join prompt into single string
	prompt = prompt.join(' ');
	
	// Set static options
	options = _loadOpts(options);

	// Ensure numbers
	options.maxTokens = Number(options.maxTokens) || 256;
	options.temperature = Number(options.temperature) || 0.2;
	options.history = Number(options.history) || 0;
	
	// Preproceess the prompt
	if(options.context){
		prompt = 'In the context of '
			+options.context.join(' ')
			+', '+prompt;
	}
	if(options.domain){
		prompt = 'In the domain of '
			+options.domain.join(' ')
			+', '+prompt;
	}
	if(options.expert){
		prompt = 'Act as an expert on '
			+options.expert.join(' ')
			+'. The question I need you to answer is: '+prompt;
	}
	
	// Append History
	const ogPrompt = prompt;// Cache for history etc
	if(options.history){
		prompt = _loadHistory(options.history,false)// Revrsed
			+prompt;	
	}
	
	// Count total prompt tokens and append to the maxTokens value
	const encoded = encode(prompt);
	const tokenCount = encoded.length;
	const totalTokens = options.maxTokens + tokenCount;
	// GPT can use a total of 4096 tokens at once
	// Using 4k for the prompt allows us 96 for response
	if(totalTokens > 4000){
		console.log('ERROR: Max Tokens Exceeded');
		console.log('Please limit your prompt');
		if(options.history){
			console.log('Trying running with history off!');
		}
	}

	// Apply verbos outout
	if(options.verbose){
		console.log('>> '+ogPrompt+' <<');
		console.log(JSON.stringify(options, null, 2));
		console.log('Total Tokens Used: '+totalTokens);
		console.log('Sending Prompt...');
		console.log('-------\r\n');
	}
	
	// Make the request
	let output = 'No Response!';
	if(!options.mock){
		const completion = await openai.createCompletion({
  			model: "text-davinci-003",
  			prompt: prompt,
			max_tokens: totalTokens,
        		temperature: options.temperature
		});
		output = completion.data.choices[0].text;
	}
	// Strip dialog references
	if(options.history){
		output = output.replace('_user_:','');
		output = output.replace('_llm_:','');
	}
	// Trim whitesapce
	output = output.trim();
	// Log output
	console.log(output);
	
	// Log history
	_logHistory(ogPrompt, output);
}


function _ensureFiles(){
	if(!fs.existsSync(__dirname+'/history.json')){
		// Create the file
		fs.writeFileSync(__dirname+'/history.json', '[]');
	}
	if(!fs.existsSync(__dirname+'/settings.json')){
		// Create the file
		fs.writeFileSync(__dirname+'/settings.json', '{}');
	}
}

function _logHistory(ogPrompt, output){
	const histNew = {
		user: ogPrompt,
		llm: output
	};
	const historyJSON = _loadHistory(MAX_HISTORY_STORE, false, true);
	historyJSON.push(histNew);
	fs.writeFileSync(__dirname+'/history.json', JSON.stringify(historyJSON, null, 2));
}

function _loadHistory(count=1,reverse=true,json=false){
	let content = fs.readFileSync(__dirname+'/history.json', 'UTF-8');
	if(!content){
		console.log('WARNING: Can not read history file!');	
		content = '[]';
	}
	let historyJSON = JSON.parse(content) || [];
	// Always reverse history first
	historyJSON.reverse();
	// Slice the history
	historyJSON = historyJSON.slice(0, count);
	// Undo reverse if needed
	if(reverse===false){
		historyJSON.reverse();
	}
	if(json){
		// Return json
		return historyJSON;
	}	
	let historyStr = '';
	for(const item of historyJSON){
		historyStr += '_user_: '+item.user;
		historyStr += '\r\n';
		historyStr += '_llm_: '+item.llm;
		historyStr += '\r\n';
	}
	return historyStr;
}

function history(options){
	if(options.delete){
		fs.rmSync(__dirname+'/history.json');
		console.log('Deleted History');
		return;
	}
	// Default to view
	if(options.view){
		// Ensure number
		options.view = Number(options.view) || 32;
		const content = _loadHistory(options.view, false);
		console.log(content);
		return;
	}
}

function settings(){
	const content = fs.readFileSync(__dirname+'/settings.json', 'UTF-8');
	console.log(content);
	console.log('Settings can be changed with the \`set\` command.');
}

function _loadOpts(options){
	const content = fs.readFileSync(__dirname+'/settings.json', 'UTF-8');
	const optJSON = JSON.parse(content);
	options = Object.assign(options, optJSON);
	return options;
}

function setOpts(options){
	console.log(JSON.stringify(options));
	fs.writeFileSync(__dirname+'/settings.json', JSON.stringify(options, null, 2));
	console.log('Created a new settings file');
}

const program = new Command();

program
  .name('sllm')
  .description('CLI for GPT3. Created by Mathieu Dombrock 2023. GPL3 License.')
  .version('0.8.0');

program.command('prompt', {isDefault: true})
	.description('Send a prompt (default command)')
	.argument('<prompt...>', 'the prompt text')
	.option('-m, --max-tokens <number>', 'maximum tokens to use', '256')
	.option('-t, --temperature <number>', 'temperature to use', '0.2')
	.option('-c, --context <string...>', 'Context to prepend')
	.option('-d, --domain <string...>', 'Subject domain to prepend')
	.option('-e, --expert <string...>', 'Act as an expert on this domain')
	.option('-H, --history <number>', 'Prepend history (chatGPT mode)', '0')
	.option('-v, --verbose', 'verbose output')
	.option('-M, --mock', 'Dont actually send the prompt to the API')
	.action((prompt, options) => {
		run(prompt, options);
  	});

program.command('set')
	.description('Set a persistant command option')
	.option('-m, --max-tokens <number>', 'maximum tokens to use', '256')
	.option('-t, --temperature <number>', 'temperature to use', '0.2')
	.option('-c, --context <string...>', 'Context to prepend')
	.option('-d, --domain <string...>', 'Subject domain to prepend')
	.option('-e, --expert <string...>', 'Act as an expert on this domain')
	.option('-H, --history <number>', 'Prepend history (chatGPT mode)', '0')
	.option('-v, --verbose', 'verbose output')
	.option('-M, --mock', 'Dont actually send the prompt to the API')
	.action((options) => {
		setOpts(options);
	});

program.command('settings')
	.description('View the current settings that were changed via the \`set\` command.')
	.action(() =>{
		settings()
	});

program.command('hist')
	.description('Manage the prompt/response history')
	.option('-v, --view <number>', 'View the prompt history', '8')
	.option('-d, --delete', 'Delete the prompt history')
	.action((options) => {
		history(options);
	});



program.parse();


