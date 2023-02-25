#! /usr/bin/env node
const { Configuration, OpenAIApi } = require("openai");

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

const max_tokens = Number(process.env.SLLM_MAX_TOKENS) || 256;
const temperature = Number(process.env.SLLM_TEMPERATURE) || 0.4;

console.log(temperature);

async function run(prompt){
	const completion = await openai.createCompletion({
  		model: "text-davinci-003",
  		prompt: prompt,
		max_tokens: max_tokens,
        temperature: temperature
	});
	console.log('-------\r\n');
	console.log(completion.data.choices[0].text);
}
const prompt = process.argv.slice(2,process.argv.length-1).join(' ');
if(prompt.length < 1){
    console.log('ERROR: Please provide a prompt');
    process.exit();
}
run(prompt);
