#! /usr/bin/env node
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
	options.maxTokens = Number(options.maxTokens) || 256;
	options.temperature = Number(options.temperature) || 0.2;
	
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

	if(options.verbose){
		console.log('>> '+prompt);
		console.log(options);
		console.log('Sending Prompt...');
	}
	const completion = await openai.createCompletion({
  		model: "text-davinci-003",
  		prompt: prompt,
		max_tokens: options.maxTokens,
        	temperature: options.temperature
	});
	console.log('-------\r\n');
	console.log(completion.data.choices[0].text);
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
	.option('-c, --context <string...>', 'Context to prefix')
	.option('-d, --domain <string...>', 'Subject domain to prefix')
	.option('-e, --expert <string...>', 'Act as an expert on this domain')
	.option('-v, --verbose', 'verbose output')
	.action((prompt, options) => {
		run(prompt.join(' '), options);
  	});

program.parse();


