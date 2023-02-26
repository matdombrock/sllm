#! /usr/bin/env node
const fs = require('fs');

const { encode, decode } = require('gpt-3-encoder');

const { Configuration, OpenAIApi } = require("openai");

const { Command } = require('commander'); // (normal include)
if(!process.env.OPENAI_API_KEY){
    let err = 'ERROR: OPENAI_API_KEY unset\r\n';
    err += 'To set, use the command:\r\n'; 
    err += 'export OPEN_API_KEY=<your_key>\r\n';
    err += 'https://platform.openai.com/account/api-keys';
    console.log(err);
    process.exit();
}

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

async function run(prompt, options){
	// Join prompt into single string
	prompt = prompt.join(' ');
	
	// Ensure numbers
	options.maxTokens = Number(options.maxTokens) || 256;
	options.temperature = Number(options.temperature) || 0.2;
	
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
		prompt = fs.readFileSync('./history.txt', 'UTF-8')
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
		prompt.replace('_user_: ','');
		prompt.replace('_llm_: ','');
	}
	// Log output
	console.log('-------\r\n');
	console.log(output);
	
	// Log history
	_logHistory(ogPrompt, output);
}


function _logHistory(ogPrompt, output){
	let histOut = '_user_: '+ogPrompt;
	histOut += '\r\n\r\n';
	histOut += '_llm_: '+output;
	histOut += '\r\n\r\n';
	// Enable for full history
	//fs.appendFileSync('./history.txt', histOut);
	fs.writeFileSync('./history.txt', histOut);
}

function history(options){
	if(options.delete){
		fs.rmSync('./history.txt');
		console.log('Deleted History');
		return;
	}
	// Default to view
	options.view = true;
	if(options.view){
		const content = fs.readFileSync('./history.txt', 'UTF-8');
		console.log(content);
		return;
	}
}

const program = new Command();

program
  .name('sllm')
  .description('CLI for GPT3. Created by Mathieu Dombrock 2023. GPL3 License.')
  .version('0.8.0');

program.command('prompt', {isDefault: true})
	.description('Send a prompt (default command)')
	.argument('<prompt...>', 'the prompt text')
	.option('-m, --max-tokens <number>', 'maximum tokens to use')
	.option('-t, --temperature <number>', 'temperature to use')
	.option('-c, --context <string...>', 'Context to prepend')
	.option('-d, --domain <string...>', 'Subject domain to prepend')
	.option('-e, --expert <string...>', 'Act as an expert on this domain')
	.option('-H, --history', 'Prepend history (chatGPT mode)')
	.option('-v, --verbose', 'verbose output')
	.option('-M, --mock', 'Dont actually send the prompt to the API')
	.action((prompt, options) => {
		run(prompt, options);
  	});

program.command('history')
	.description('Manage the prompt/response history')
	.option('-v, --view', 'View the prompt history')
	.option('-d, --delete', 'Delete the prompt history')
	.action((options) => {
		history(options);
	});

program.parse();


